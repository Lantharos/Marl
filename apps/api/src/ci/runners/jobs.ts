import { emitRepositoryEvent } from '../../webhooks/events';
import type { RunnerJobLease } from '@marl/contracts';
import { sha256 } from '../../auth/principal';
import { identifier } from '../../core/domain';
import { json, problem, readBody, readJson } from '../../http/http';
import type { Env } from '../../core/platform';
import { completeJobBody } from '../../http/request-schemas';
import { notifyPullsForCommit } from '../../pulls/realtime/updates';
import { publishRunLog } from '../runs/realtime';
import { auditStatement } from '../../core/audit';
import { jobSecrets } from '../workflows/secrets';
import { reserveLogChunkSql, runnerQuotas } from './quotas';
import { publishJobRelease } from '../../releases/job-releases';
import { type Runner, checkForJobSql } from './runners';
import { byteStream } from './artifacts';

export async function claimJob(env: Env, runner: Runner): Promise<Response> {
  await env.DB.prepare(
    `UPDATE jobs SET state=CASE WHEN (SELECT state FROM runs WHERE runs.id=jobs.run_id)='canceled' THEN 'canceled' ELSE 'queued' END,runner_id=NULL,lease_token_hash=NULL,lease_expires_at=NULL,completed_at=CASE WHEN (SELECT state FROM runs WHERE runs.id=jobs.run_id)='canceled' THEN CURRENT_TIMESTAMP ELSE completed_at END WHERE state='running' AND lease_expires_at<CURRENT_TIMESTAMP AND EXISTS (SELECT 1 FROM runs JOIN repositories ON repositories.id=runs.repository_id WHERE runs.id=jobs.run_id AND repositories.organization_id=?)`
  )
    .bind(runner.organizationId)
    .run();
  const labels = new Set<string>(JSON.parse(runner.labelsJson));
  const candidates = await env.DB.prepare(
    `SELECT jobs.id, jobs.required_labels_json AS labelsJson FROM jobs JOIN runs ON runs.id=jobs.run_id JOIN repositories ON repositories.id=runs.repository_id WHERE jobs.state='queued' AND runs.state IN ('queued','running') AND runs.approval_required=0 AND repositories.organization_id=? AND NOT EXISTS (SELECT 1 FROM json_each(jobs.needs_json) AS need LEFT JOIN jobs AS dependency ON dependency.run_id=jobs.run_id AND dependency.job_key=need.value WHERE dependency.id IS NULL OR dependency.state!='success') ORDER BY jobs.created_at LIMIT 50`
  )
    .bind(runner.organizationId)
    .all<{ id: string; labelsJson: string }>();
  type ClaimedJob = {
    id: string;
    stepsJson: string;
    environmentJson: string;
    artifactPathsJson: string;
    runtimeJson: string;
    leaseExpiresAt: string;
    runId: string;
    runNumber: number;
    runName: string;
    branch: string;
    commitId: string;
    repositoryId: string;
    untrusted: number;
    owner: string;
    repository: string;
  };
  let leaseToken = '';
  let job: ClaimedJob | null = null;
  for (const candidate of candidates.results) {
    if (!(JSON.parse(candidate.labelsJson) as string[]).every((label) => labels.has(label))) continue;
    const token = `marl_lease_${crypto.randomUUID().replaceAll('-', '')}`;
    const tokenHash = await sha256(token);
    const claimed = await env.DB.prepare(
      `UPDATE jobs SET state='running',runner_id=?,lease_token_hash=?,lease_expires_at=datetime('now','+45 seconds'),attempt=attempt+1,started_at=COALESCE(started_at,CURRENT_TIMESTAMP) WHERE id=? AND state='queued' AND EXISTS (SELECT 1 FROM runs WHERE runs.id=jobs.run_id AND runs.approval_required=0 AND runs.state IN ('queued','running')) RETURNING id`
    )
      .bind(runner.id, tokenHash, candidate.id)
      .first<{ id: string }>();
    if (!claimed) continue;
    job = await env.DB.prepare(
      `SELECT jobs.id, jobs.steps_json AS stepsJson, jobs.environment_json AS environmentJson, jobs.artifact_paths_json AS artifactPathsJson, jobs.runtime_json AS runtimeJson, jobs.lease_expires_at AS leaseExpiresAt, runs.id AS runId, runs.number AS runNumber, runs.name AS runName, runs.branch, runs.commit_id AS commitId, runs.repository_id AS repositoryId,runs.untrusted, organizations.slug AS owner, repositories.name AS repository FROM jobs JOIN runs ON runs.id=jobs.run_id JOIN repositories ON repositories.id=COALESCE(runs.checkout_repository_id,runs.repository_id) JOIN organizations ON organizations.id=repositories.organization_id WHERE jobs.id=? AND jobs.runner_id=? AND jobs.lease_token_hash=?`
    )
      .bind(candidate.id, runner.id, tokenHash)
      .first<ClaimedJob>();
    leaseToken = token;
    break;
  }
  if (!job) return new Response(null, { status: 204 });
  let secrets: Record<string, string>;
  try {
    secrets = job.untrusted ? {} : await jobSecrets(env, runner.organizationId, job.repositoryId);
  } catch {
    await env.DB.prepare(
      `UPDATE jobs SET state='queued',runner_id=NULL,lease_token_hash=NULL,lease_expires_at=NULL WHERE id=? AND runner_id=?`
    )
      .bind(job.id, runner.id)
      .run();
    return problem(503, 'secret_decryption_unavailable', 'Job secrets could not be decrypted.');
  }
  const secretNames = Object.keys(secrets);
  await env.DB.batch([
    env.DB.prepare(`UPDATE runners SET active_jobs=active_jobs+1,last_seen_at=CURRENT_TIMESTAMP WHERE id=?`).bind(
      runner.id
    ),
    env.DB.prepare(
      `UPDATE runs SET state='running',started_at=COALESCE(started_at,CURRENT_TIMESTAMP) WHERE id=? AND state='queued'`
    ).bind(job.runId),
    env.DB.prepare(
      `UPDATE checks SET state='running',started_at=COALESCE(started_at,CURRENT_TIMESTAMP),updated_at=CURRENT_TIMESTAMP WHERE ${checkForJobSql}`
    ).bind(job.id),
    ...(secretNames.length
      ? [
          auditStatement(env, {
            organizationId: runner.organizationId,
            repositoryId: job.repositoryId,
            action: 'ci.secrets.delivered',
            subjectType: 'job',
            subjectId: job.id,
            details: { runnerId: runner.id, names: secretNames }
          })
        ]
      : [])
  ]);
  await notifyPullsForCommit(env, job.repositoryId, job.commitId);
  return json({
    job: {
      id: job.id,
      leaseToken,
      run: { id: job.runId, number: job.runNumber, name: job.runName },
      repository: {
        owner: job.owner,
        name: job.repository,
        cloneUrl: `${env.GIT_PUBLIC_URL ?? env.GIT_GATEWAY_URL}/${job.owner}/${job.repository}.git`
      },
      branch: job.branch,
      commitId: job.commitId,
      steps: JSON.parse(job.stepsJson),
      environment: { ...JSON.parse(job.environmentJson), ...secrets },
      maskValues: Object.values(secrets),
      artifactPaths: JSON.parse(job.artifactPathsJson),
      runtime: JSON.parse(job.runtimeJson),
      leaseExpiresAt: job.leaseExpiresAt
    } satisfies RunnerJobLease
  });
}

export async function ownsLease(env: Env, runner: Runner, jobId: string, leaseToken: string | null) {
  if (!leaseToken) return null;
  return env.DB.prepare(
    `SELECT jobs.id, jobs.run_id AS runId, jobs.cancel_requested AS cancelRequested, runs.state AS runState, runs.cancellation_reason AS cancellationReason, runs.repository_id AS repositoryId, runs.commit_id AS commitId FROM jobs JOIN runs ON runs.id=jobs.run_id WHERE jobs.id=? AND jobs.runner_id=? AND jobs.lease_token_hash=? AND jobs.state='running' AND jobs.lease_expires_at > CURRENT_TIMESTAMP`
  )
    .bind(jobId, runner.id, await sha256(leaseToken))
    .first<{
      id: string;
      runId: string;
      cancelRequested: number;
      runState: string;
      cancellationReason: string | null;
      repositoryId: string;
      commitId: string;
    }>();
}

export async function renewJob(request: Request, env: Env, runner: Runner, jobId: string): Promise<Response> {
  const job = await ownsLease(env, runner, jobId, request.headers.get('x-marl-job-lease'));
  if (!job) return problem(409, 'lease_lost', 'This job lease is no longer valid.');
  await env.DB.batch([
    env.DB.prepare(`UPDATE jobs SET lease_expires_at=datetime('now','+45 seconds') WHERE id=?`).bind(jobId),
    env.DB.prepare(`UPDATE runners SET last_seen_at=CURRENT_TIMESTAMP WHERE id=?`).bind(runner.id)
  ]);
  const canceled = await env.DB.prepare('SELECT cancel_requested AS canceled FROM jobs WHERE id=?')
    .bind(jobId)
    .first<{ canceled: number }>();
  return json({ leaseExpiresAt: new Date(Date.now() + 45_000).toISOString(), canceled: Boolean(canceled?.canceled) });
}

export async function uploadLog(
  request: Request,
  env: Env,
  runner: Runner,
  jobId: string,
  sequence: number
): Promise<Response> {
  const job = await ownsLease(env, runner, jobId, request.headers.get('x-marl-job-lease'));
  if (!job || !request.body) return problem(409, 'lease_lost', 'This job lease is no longer valid.');
  if (!Number.isSafeInteger(sequence) || sequence < 0)
    return problem(422, 'invalid_log_sequence', 'Log chunks require a valid sequence.');
  if (sequence >= runnerQuotas.logChunksPerJob)
    return problem(413, 'job_log_limit', 'A job can retain at most 65,536 log chunks.');
  const existing = await env.DB.prepare('SELECT id FROM job_log_chunks WHERE job_id=? AND sequence=?')
    .bind(jobId, sequence)
    .first();
  if (existing) return new Response(null, { status: 204 });
  const bytes = await readBody(request, runnerQuotas.logChunkBytes);
  if (!bytes) return problem(413, 'log_chunk_too_large', 'Log chunks are limited to 1 MiB.');
  if (bytes.byteLength === 0) return new Response(null, { status: 204 });
  const id = identifier('log');
  const key = `logs/${jobId}/${String(sequence).padStart(10, '0')}-${id}`;
  let stored = false;
  let retained = false;
  try {
    await env.OBJECTS.put(key, bytes, { httpMetadata: { contentType: 'text/plain; charset=utf-8' } });
    stored = true;
    const reservation = await env.DB.prepare(reserveLogChunkSql)
      .bind(
        id,
        jobId,
        sequence,
        key,
        bytes.byteLength,
        bytes.byteLength,
        runnerQuotas.logBytesPerJob,
        jobId,
        jobId,
        runnerQuotas.logChunksPerJob
      )
      .run();
    if (reservation.meta.changes !== 1) {
      const duplicate = await env.DB.prepare('SELECT id FROM job_log_chunks WHERE job_id=? AND sequence=?')
        .bind(jobId, sequence)
        .first();
      if (duplicate) return new Response(null, { status: 204 });
      return problem(413, 'job_log_limit', 'A job can retain at most 64 MiB of logs.');
    }
    retained = true;
    await publishRunLog(env, jobId, sequence, byteStream(bytes)).catch(() => undefined);
    return new Response(null, { status: 204 });
  } finally {
    if (stored && !retained) await env.OBJECTS.delete(key);
  }
}

export async function completeJob(request: Request, env: Env, runner: Runner, jobId: string): Promise<Response> {
  const job = await ownsLease(env, runner, jobId, request.headers.get('x-marl-job-lease'));
  const body = await readJson(request, completeJobBody);
  if (
    !job ||
    !body ||
    !['success', 'failure', 'canceled'].includes(String(body.state)) ||
    !Number.isInteger(body.exitCode)
  )
    return problem(409, 'lease_lost', 'This job lease is no longer valid.');
  let state = job.cancelRequested || job.runState === 'canceled' ? 'canceled' : String(body.state);
  let releaseFailure = '';
  if (state === 'success') {
    const releaseError = await publishJobRelease(env, jobId);
    if (releaseError) {
      const payload = (await releaseError.json().catch(() => null)) as { error?: { message?: string } } | null;
      state = 'failure';
      releaseFailure = payload?.error?.message ?? 'The declared release could not be published.';
    }
  }
  const summary =
    state === 'canceled'
      ? job.cancellationReason === 'superseded'
        ? 'Superseded by a newer push.'
        : job.cancellationReason === 'developer'
          ? 'Canceled by a developer.'
          : typeof body.summary === 'string'
            ? body.summary.slice(0, 1000)
            : 'Canceled by the runner.'
      : releaseFailure || (typeof body.summary === 'string' ? body.summary.slice(0, 1000) : '');
  await env.DB.batch([
    env.DB.prepare(
      `UPDATE jobs SET state=?,exit_code=?,completed_at=CURRENT_TIMESTAMP,lease_token_hash=NULL,lease_expires_at=NULL WHERE id=? AND state='running'`
    ).bind(state, state === 'canceled' ? 130 : releaseFailure ? 1 : body.exitCode, jobId),
    env.DB.prepare(
      `UPDATE runners SET active_jobs=MAX(active_jobs-1,0),last_seen_at=CURRENT_TIMESTAMP WHERE id=?`
    ).bind(runner.id),
    env.DB.prepare(
      `UPDATE checks SET state=?,summary=?,completed_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE ${checkForJobSql}`
    ).bind(state, summary, jobId)
  ]);
  for (let depth = 0; depth < 32; depth += 1) {
    const canceled = await env.DB.prepare(
      `UPDATE jobs SET state='canceled',completed_at=CURRENT_TIMESTAMP WHERE run_id=? AND state='queued' AND EXISTS (SELECT 1 FROM json_each(jobs.needs_json) AS need JOIN jobs AS dependency ON dependency.run_id=jobs.run_id AND dependency.job_key=need.value WHERE dependency.state IN ('failure','canceled'))`
    )
      .bind(job.runId)
      .run();
    if (!canceled.meta?.changes) break;
  }
  await env.DB.prepare(
    `UPDATE checks SET state='canceled',summary='A required job did not succeed.',completed_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id IN (SELECT job_checks.id FROM checks AS job_checks JOIN runs ON runs.id=? JOIN jobs ON jobs.run_id=runs.id AND jobs.state='canceled' WHERE job_checks.repository_id=COALESCE(runs.checkout_repository_id,runs.repository_id) AND job_checks.commit_id=runs.commit_id AND job_checks.producer_repository_id=runs.repository_id AND job_checks.producer_workflow_id=runs.workflow_id AND job_checks.producer_job_key=jobs.job_key) AND state='queued'`
  )
    .bind(job.runId)
    .run();
  const remaining = await env.DB.prepare(`SELECT state,COUNT(*) AS count FROM jobs WHERE run_id=? GROUP BY state`)
    .bind(job.runId)
    .all<{ state: string; count: number }>();
  const states = new Set(remaining.results.map((row) => row.state));
  const runState = states.has('failure')
    ? 'failure'
    : states.has('canceled')
      ? 'canceled'
      : states.has('running')
        ? 'running'
        : states.has('queued')
          ? 'queued'
          : 'success';
  const transition = await env.DB.prepare(
    `UPDATE runs SET state=?,completed_at=CASE WHEN ? IN ('success','failure','canceled') THEN CURRENT_TIMESTAMP ELSE NULL END WHERE id=? AND state<>?`
  )
    .bind(runState, runState, job.runId, runState)
    .run();
  await notifyPullsForCommit(env, job.repositoryId, job.commitId);
  if (transition.meta.changes && ['success', 'failure', 'canceled'].includes(runState))
    await emitRepositoryEvent(env, job.repositoryId, 'run', 'completed', { kind: 'run', id: job.runId }, null);
  return json({ completed: true, runState });
}
