import type { Principal } from './auth';
import { requireFreshSession, sha256 } from './auth';
import { identifier, validSlug } from './domain';
import { json, problem, readJson } from './http';
import type { Env } from './platform';
import { artifactUploadBody, completeJobBody, runnerEnrollmentBody, runnerRegistrationBody } from './request-schemas';
import { notifyPullsForCommit } from './pull-realtime';
import { publishRunLog } from './run-realtime';

type Runner = { id: string; organizationId: string; name: string; labelsJson: string; concurrency: number; platform: string; architecture: string; version: string };
const runnerSelect = `SELECT runners.id,runners.name,runners.labels_json AS labelsJson,runners.active_jobs AS activeJobs,runners.concurrency,runners.platform,runners.architecture,runners.version,runners.last_seen_at AS lastSeenAt,CASE WHEN runners.disabled_at IS NOT NULL OR runners.last_seen_at < datetime('now','-90 seconds') THEN 'offline' WHEN runners.active_jobs > 0 THEN 'busy' ELSE 'idle' END AS state FROM runners JOIN organization_members ON organization_members.organization_id=runners.organization_id`;
const artifactPartBytes = 16 * 1024 * 1024;

function bearer(request: Request): string | null {
  const value = request.headers.get('authorization');
  return value?.startsWith('Bearer ') ? value.slice(7) : null;
}

function cleanLabels(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length > 32) return null;
  const labels = [...new Set(value.map(String).map((label) => label.trim().toLowerCase()))];
  return labels.every((label) => /^[a-z0-9][a-z0-9._-]{0,39}$/.test(label)) ? labels : null;
}

export async function authenticateRunner(request: Request, env: Env): Promise<Runner | null> {
  const token = bearer(request);
  if (!token) return null;
  return env.DB.prepare(`SELECT id, organization_id AS organizationId, name, labels_json AS labelsJson, concurrency, platform, architecture, version FROM runners WHERE token_hash = ? AND disabled_at IS NULL`).bind(await sha256(token)).first<Runner>();
}

export async function createEnrollment(request: Request, env: Env, principal: Principal): Promise<Response> {
  if (!(await requireFreshSession(request, env, principal))) return problem(403, 'fresh_admin_session_required', 'Confirm your identity before connecting a runner.');
  const body = await readJson(request, runnerEnrollmentBody);
  if (!body || typeof body.organization !== 'string') return problem(422, 'organization_required', 'Choose an organization for this runner.');
  const organization = await env.DB.prepare(`SELECT organizations.id FROM organizations JOIN organization_members ON organization_members.organization_id = organizations.id WHERE organizations.slug = ? COLLATE NOCASE AND organization_members.user_id = ? AND organization_members.role IN ('owner','admin')`).bind(body.organization, principal.id).first<{ id: string }>();
  if (!organization) return problem(403, 'admin_required', 'Only organization administrators can connect runners.');
  const token = `marl_enroll_${crypto.randomUUID().replaceAll('-', '')}`;
  const minutes = Math.min(Math.max(Number(body.expiresMinutes) || 15, 5), 60);
  const id = identifier('enrollment');
  await env.DB.prepare(`INSERT INTO runner_enrollment_tokens (id, organization_id, token_hash, created_by, expires_at) VALUES (?, ?, ?, ?, datetime('now', ?))`).bind(id, organization.id, await sha256(token), principal.id, `+${minutes} minutes`).run();
  return json({ enrollment: { id, token, expiresAt: new Date(Date.now() + minutes * 60_000).toISOString() } }, { status: 201 });
}

export async function registerRunner(request: Request, env: Env): Promise<Response> {
  const body = await readJson(request, runnerRegistrationBody);
  const labels = cleanLabels(body?.labels);
  if (!body || typeof body.enrollmentToken !== 'string' || !validSlug(body.name) || !labels || typeof body.platform !== 'string' || typeof body.architecture !== 'string' || typeof body.version !== 'string') return problem(422, 'invalid_runner', 'Runner name, platform, architecture, version, and valid labels are required.');
  const enrollment = await env.DB.prepare(`SELECT id, organization_id AS organizationId FROM runner_enrollment_tokens WHERE token_hash = ? AND used_at IS NULL AND expires_at > CURRENT_TIMESTAMP`).bind(await sha256(body.enrollmentToken)).first<{ id: string; organizationId: string }>();
  if (!enrollment) return problem(401, 'invalid_enrollment', 'This runner enrollment token is invalid, expired, or already used.');
  const concurrency = Math.min(Math.max(Number(body.concurrency) || 1, 1), 32);
  const id = identifier('runner');
  const token = `marl_runner_${crypto.randomUUID().replaceAll('-', '')}`;
  try {
    const results = await env.DB.batch([
      env.DB.prepare('INSERT INTO runners (id, organization_id, name, token_hash, labels_json, concurrency, platform, architecture, version, enrollment_id) SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, id FROM runner_enrollment_tokens WHERE id = ? AND used_at IS NULL').bind(id, enrollment.organizationId, body.name, await sha256(token), JSON.stringify(labels), concurrency, body.platform.slice(0, 80), body.architecture.slice(0, 80), body.version.slice(0, 40), enrollment.id),
      env.DB.prepare('UPDATE runner_enrollment_tokens SET used_at = CURRENT_TIMESTAMP WHERE id = ? AND used_at IS NULL').bind(enrollment.id)
    ]);
    if (results[0]?.meta?.changes !== 1) return problem(401, 'invalid_enrollment', 'This runner enrollment token is invalid, expired, or already used.');
  } catch (error) {
    if (String(error).toLowerCase().includes('unique')) return problem(409, 'runner_exists', 'A runner with this name already exists.');
    throw error;
  }
  return json({ runner: { id, name: body.name, labels, concurrency }, token }, { status: 201 });
}

export async function listRunners(env: Env, principal: Principal): Promise<Response> {
  if (principal.authType === 'token') return problem(403, 'browser_session_required', 'Runners can only be managed from a browser session.');
  const rows = await env.DB.prepare(`${runnerSelect} WHERE organization_members.user_id=? ORDER BY state,runners.name`).bind(principal.id).all<{ id: string; name: string; labelsJson: string; activeJobs: number; concurrency: number; platform: string; architecture: string; version: string; lastSeenAt: string; state: string }>();
  return json({ runners: rows.results.map(({ labelsJson, ...runner }) => ({ ...runner, labels: JSON.parse(labelsJson) })) });
}

export async function getRunner(env: Env, principal: Principal, id: string): Promise<Response> {
  if (principal.authType === 'token') return problem(403, 'browser_session_required', 'Runners can only be managed from a browser session.');
  const row = await env.DB.prepare(`${runnerSelect} WHERE organization_members.user_id=? AND runners.id=?`).bind(principal.id, id).first<{ id: string; name: string; labelsJson: string; activeJobs: number; concurrency: number; platform: string; architecture: string; version: string; lastSeenAt: string; state: string }>();
  if (!row) return problem(404, 'runner_not_found', 'Runner not found.');
  const { labelsJson, ...runner } = row;
  return json({ runner: { ...runner, labels: JSON.parse(labelsJson) } });
}

export async function heartbeatRunner(env: Env, runner: Runner): Promise<Response> {
  await env.DB.prepare(`UPDATE runners SET last_seen_at=CURRENT_TIMESTAMP, active_jobs=(SELECT COUNT(*) FROM jobs WHERE runner_id=? AND state='running') WHERE id=?`).bind(runner.id, runner.id).run();
  const canceled = await env.DB.prepare(`SELECT id FROM jobs WHERE runner_id=? AND state='running' AND cancel_requested=1`).bind(runner.id).all<{ id: string }>();
  return json({ cancelJobIds: canceled.results.map((job) => job.id) });
}

export async function claimJob(env: Env, runner: Runner): Promise<Response> {
  await env.DB.prepare(`UPDATE jobs SET state=CASE WHEN (SELECT state FROM runs WHERE runs.id=jobs.run_id)='canceled' THEN 'canceled' ELSE 'queued' END,runner_id=NULL,lease_token_hash=NULL,lease_expires_at=NULL,completed_at=CASE WHEN (SELECT state FROM runs WHERE runs.id=jobs.run_id)='canceled' THEN CURRENT_TIMESTAMP ELSE completed_at END WHERE state='running' AND lease_expires_at<CURRENT_TIMESTAMP AND EXISTS (SELECT 1 FROM runs JOIN repositories ON repositories.id=runs.repository_id WHERE runs.id=jobs.run_id AND repositories.organization_id=?)`).bind(runner.organizationId).run();
  const labels = new Set<string>(JSON.parse(runner.labelsJson));
  const candidates = await env.DB.prepare(`SELECT jobs.id, jobs.required_labels_json AS labelsJson FROM jobs JOIN runs ON runs.id=jobs.run_id JOIN repositories ON repositories.id=runs.repository_id WHERE jobs.state='queued' AND runs.state IN ('queued','running') AND repositories.organization_id=? AND NOT EXISTS (SELECT 1 FROM json_each(jobs.needs_json) AS need LEFT JOIN jobs AS dependency ON dependency.run_id=jobs.run_id AND dependency.job_key=need.value WHERE dependency.id IS NULL OR dependency.state!='success') ORDER BY jobs.created_at LIMIT 50`).bind(runner.organizationId).all<{ id: string; labelsJson: string }>();
  type ClaimedJob = { id: string; stepsJson: string; environmentJson: string; artifactPathsJson: string; runtimeJson: string; leaseExpiresAt: string; runId: string; runNumber: number; runName: string; branch: string; commitId: string; repositoryId: string; owner: string; repository: string };
  let leaseToken = '';
  let job: ClaimedJob | null = null;
  for (const candidate of candidates.results) {
    if (!(JSON.parse(candidate.labelsJson) as string[]).every((label) => labels.has(label))) continue;
    const token = `marl_lease_${crypto.randomUUID().replaceAll('-', '')}`;
    const tokenHash = await sha256(token);
    const claimed = await env.DB.prepare(`UPDATE jobs SET state='running',runner_id=?,lease_token_hash=?,lease_expires_at=datetime('now','+45 seconds'),attempt=attempt+1,started_at=COALESCE(started_at,CURRENT_TIMESTAMP) WHERE id=? AND state='queued' RETURNING id`).bind(runner.id, tokenHash, candidate.id).first<{ id: string }>();
    if (!claimed) continue;
    job = await env.DB.prepare(`SELECT jobs.id, jobs.steps_json AS stepsJson, jobs.environment_json AS environmentJson, jobs.artifact_paths_json AS artifactPathsJson, jobs.runtime_json AS runtimeJson, jobs.lease_expires_at AS leaseExpiresAt, runs.id AS runId, runs.number AS runNumber, runs.name AS runName, runs.branch, runs.commit_id AS commitId, runs.repository_id AS repositoryId, organizations.slug AS owner, repositories.name AS repository FROM jobs JOIN runs ON runs.id=jobs.run_id JOIN repositories ON repositories.id=runs.repository_id JOIN organizations ON organizations.id=repositories.organization_id WHERE jobs.id=? AND jobs.runner_id=? AND jobs.lease_token_hash=?`).bind(candidate.id, runner.id, tokenHash).first<ClaimedJob>();
    leaseToken = token;
    break;
  }
  if (!job) return new Response(null, { status: 204 });
  await env.DB.batch([
    env.DB.prepare(`UPDATE runners SET active_jobs=active_jobs+1,last_seen_at=CURRENT_TIMESTAMP WHERE id=?`).bind(runner.id),
    env.DB.prepare(`UPDATE runs SET state='running',started_at=COALESCE(started_at,CURRENT_TIMESTAMP) WHERE id=? AND state='queued'`).bind(job.runId),
    env.DB.prepare(`UPDATE checks SET state='running',started_at=COALESCE(started_at,CURRENT_TIMESTAMP),updated_at=CURRENT_TIMESTAMP WHERE repository_id=(SELECT repository_id FROM runs WHERE id=?) AND commit_id=? AND name=(SELECT check_name FROM jobs WHERE id=?)`).bind(job.runId, job.commitId, job.id)
  ]);
  await notifyPullsForCommit(env, job.repositoryId, job.commitId);
  return json({ job: { id: job.id, leaseToken, run: { id: job.runId, number: job.runNumber, name: job.runName }, repository: { owner: job.owner, name: job.repository, cloneUrl: `${env.GIT_PUBLIC_URL ?? env.GIT_GATEWAY_URL}/${job.owner}/${job.repository}.git` }, branch: job.branch, commitId: job.commitId, steps: JSON.parse(job.stepsJson), environment: JSON.parse(job.environmentJson), artifactPaths: JSON.parse(job.artifactPathsJson), runtime: JSON.parse(job.runtimeJson), leaseExpiresAt: job.leaseExpiresAt } });
}

async function ownsLease(env: Env, runner: Runner, jobId: string, leaseToken: string | null) {
  if (!leaseToken) return null;
  return env.DB.prepare(`SELECT jobs.id, jobs.run_id AS runId, jobs.cancel_requested AS cancelRequested, runs.state AS runState, runs.cancellation_reason AS cancellationReason, runs.repository_id AS repositoryId, runs.commit_id AS commitId FROM jobs JOIN runs ON runs.id=jobs.run_id WHERE jobs.id=? AND jobs.runner_id=? AND jobs.lease_token_hash=? AND jobs.state='running' AND jobs.lease_expires_at > CURRENT_TIMESTAMP`).bind(jobId, runner.id, await sha256(leaseToken)).first<{ id: string; runId: string; cancelRequested: number; runState: string; cancellationReason: string | null; repositoryId: string; commitId: string }>();
}

export async function renewJob(request: Request, env: Env, runner: Runner, jobId: string): Promise<Response> {
  const job = await ownsLease(env, runner, jobId, request.headers.get('x-marl-job-lease'));
  if (!job) return problem(409, 'lease_lost', 'This job lease is no longer valid.');
  await env.DB.batch([
    env.DB.prepare(`UPDATE jobs SET lease_expires_at=datetime('now','+45 seconds') WHERE id=?`).bind(jobId),
    env.DB.prepare(`UPDATE runners SET last_seen_at=CURRENT_TIMESTAMP WHERE id=?`).bind(runner.id)
  ]);
  const canceled = await env.DB.prepare('SELECT cancel_requested AS canceled FROM jobs WHERE id=?').bind(jobId).first<{ canceled: number }>();
  return json({ leaseExpiresAt: new Date(Date.now() + 45_000).toISOString(), canceled: Boolean(canceled?.canceled) });
}

export async function uploadLog(request: Request, env: Env, runner: Runner, jobId: string, sequence: number): Promise<Response> {
  const job = await ownsLease(env, runner, jobId, request.headers.get('x-marl-job-lease'));
  if (!job || !request.body) return problem(409, 'lease_lost', 'This job lease is no longer valid.');
  const size = Number(request.headers.get('content-length'));
  if (!Number.isFinite(size) || size < 0 || size > 1024 * 1024 || !Number.isSafeInteger(sequence) || sequence < 0) return problem(413, 'log_chunk_too_large', 'Log chunks are limited to 1 MiB and require a valid sequence.');
  const key = `logs/${jobId}/${String(sequence).padStart(10, '0')}`;
  const [stored, live] = request.body.tee();
  await Promise.all([
    env.OBJECTS.put(key, stored, { httpMetadata: { contentType: 'text/plain; charset=utf-8' } }),
    publishRunLog(env, jobId, sequence, live).catch(() => undefined)
  ]);
  await env.DB.prepare(`INSERT INTO job_log_chunks (id,job_id,sequence,object_key,byte_size) VALUES (?,?,?,?,?) ON CONFLICT(job_id,sequence) DO NOTHING`).bind(identifier('log'), jobId, sequence, key, size).run();
  return new Response(null, { status: 204 });
}

export async function beginArtifactUpload(request: Request, env: Env, runner: Runner, jobId: string): Promise<Response> {
  const job = await ownsLease(env, runner, jobId, request.headers.get('x-marl-job-lease'));
  if (!job) return problem(409, 'lease_lost', 'This job lease is no longer valid.');
  const body = await readJson(request, artifactUploadBody);
  if (!body || !validArtifactName(body.name)) return problem(422, 'invalid_artifact', 'Artifact names must be relative workspace paths.');
  const existing = await env.DB.prepare('SELECT id,name,byte_size AS byteSize,content_type AS contentType FROM artifacts WHERE job_id=? AND name=?').bind(jobId, body.name).first<{ id: string; name: string; byteSize: number; contentType: string }>();
  if (existing) return json({ artifact: existing, completed: true });
  await discardExpiredArtifactUploads(env);
  const id = identifier('artifact');
  const key = `artifacts/${jobId}/${id}`;
  const contentType = body.contentType ?? 'application/octet-stream';
  if (body.byteSize === 0) {
    await env.OBJECTS.put(key, new Uint8Array(), { httpMetadata: { contentType } });
    await env.DB.prepare('INSERT INTO artifacts (id,job_id,name,object_key,byte_size,content_type) VALUES (?,?,?,?,?,?)').bind(id, jobId, body.name, key, 0, contentType).run();
    return json({ artifact: { id, name: body.name, byteSize: 0, contentType }, completed: true }, { status: 201 });
  }
  const multipart = await env.OBJECTS.createMultipartUpload(key, { httpMetadata: { contentType } });
  try {
    await env.DB.prepare(`INSERT INTO artifact_uploads (id,job_id,name,object_key,multipart_upload_id,expected_size,content_type,expires_at) VALUES (?,?,?,?,?,?,?,datetime('now','+1 hour'))`).bind(id, jobId, body.name, key, multipart.uploadId, body.byteSize, contentType).run();
  } catch (error) {
    await multipart.abort();
    throw error;
  }
  return json({ upload: { id, partBytes: artifactPartBytes, partCount: Math.ceil(body.byteSize / artifactPartBytes) }, completed: false }, { status: 201 });
}

export async function uploadArtifactPart(request: Request, env: Env, runner: Runner, jobId: string, uploadId: string, partNumber: number): Promise<Response> {
  const job = await ownsLease(env, runner, jobId, request.headers.get('x-marl-job-lease'));
  if (!job || !request.body) return problem(409, 'lease_lost', 'This job lease is no longer valid.');
  const upload = await artifactUpload(env, jobId, uploadId);
  if (!upload || upload.state !== 'uploading') return problem(404, 'artifact_upload_not_found', 'Artifact upload not found.');
  const partCount = Math.ceil(upload.expectedSize / artifactPartBytes);
  const expectedSize = partNumber === partCount ? upload.expectedSize - artifactPartBytes * (partCount - 1) : artifactPartBytes;
  const size = Number(request.headers.get('content-length'));
  if (!Number.isSafeInteger(partNumber) || partNumber < 1 || partNumber > partCount || size !== expectedSize) return problem(422, 'invalid_artifact_part', 'Artifact parts must match the negotiated upload layout.');
  const multipart = env.OBJECTS.resumeMultipartUpload(upload.objectKey, upload.multipartUploadId);
  const part = await multipart.uploadPart(partNumber, request.body);
  await env.DB.prepare('INSERT INTO artifact_upload_parts (upload_id,part_number,etag,byte_size) VALUES (?,?,?,?) ON CONFLICT(upload_id,part_number) DO UPDATE SET etag=excluded.etag,byte_size=excluded.byte_size').bind(uploadId, partNumber, part.etag, size).run();
  return json({ part });
}

export async function completeArtifactUpload(request: Request, env: Env, runner: Runner, jobId: string, uploadId: string): Promise<Response> {
  const job = await ownsLease(env, runner, jobId, request.headers.get('x-marl-job-lease'));
  if (!job) return problem(409, 'lease_lost', 'This job lease is no longer valid.');
  const upload = await artifactUpload(env, jobId, uploadId);
  if (!upload) {
    const artifact = await env.DB.prepare('SELECT id,name,byte_size AS byteSize,content_type AS contentType FROM artifacts WHERE id=? AND job_id=?').bind(uploadId, jobId).first();
    return artifact ? json({ artifact, completed: true }) : problem(404, 'artifact_upload_not_found', 'Artifact upload not found.');
  }
  if (upload.state === 'completed') {
    const artifact = await env.DB.prepare('SELECT id,name,byte_size AS byteSize,content_type AS contentType FROM artifacts WHERE id=?').bind(uploadId).first();
    return json({ artifact, completed: true });
  }
  const parts = await env.DB.prepare('SELECT part_number AS partNumber,etag,byte_size AS byteSize FROM artifact_upload_parts WHERE upload_id=? ORDER BY part_number').bind(uploadId).all<{ partNumber: number; etag: string; byteSize: number }>();
  const expectedCount = Math.ceil(upload.expectedSize / artifactPartBytes);
  if (parts.results.length !== expectedCount || parts.results.some((part, index) => part.partNumber !== index + 1) || parts.results.reduce((total, part) => total + part.byteSize, 0) !== upload.expectedSize) return problem(409, 'artifact_upload_incomplete', 'Upload every artifact part before completing it.');
  const multipart = env.OBJECTS.resumeMultipartUpload(upload.objectKey, upload.multipartUploadId);
  try {
    await multipart.complete(parts.results.map(({ partNumber, etag }) => ({ partNumber, etag })));
  } catch (error) {
    const recovered = await env.OBJECTS.head(upload.objectKey);
    if (!recovered || recovered.size !== upload.expectedSize) throw error;
  }
  const object = await env.OBJECTS.head(upload.objectKey);
  if (!object || object.size !== upload.expectedSize) return problem(502, 'artifact_storage_mismatch', 'The completed artifact does not match its declared size.');
  await env.DB.batch([
    env.DB.prepare('INSERT INTO artifacts (id,job_id,name,object_key,byte_size,content_type) VALUES (?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING').bind(uploadId, jobId, upload.name, upload.objectKey, upload.expectedSize, upload.contentType),
    env.DB.prepare("UPDATE artifact_uploads SET state='completed',completed_at=CURRENT_TIMESTAMP WHERE id=?").bind(uploadId)
  ]);
  return json({ artifact: { id: uploadId, name: upload.name, byteSize: upload.expectedSize, contentType: upload.contentType }, completed: true }, { status: 201 });
}

type ArtifactUpload = { name: string; objectKey: string; multipartUploadId: string; expectedSize: number; contentType: string; state: 'uploading' | 'completed' };

function artifactUpload(env: Env, jobId: string, uploadId: string) {
  return env.DB.prepare(`SELECT name,object_key AS objectKey,multipart_upload_id AS multipartUploadId,expected_size AS expectedSize,content_type AS contentType,state FROM artifact_uploads WHERE id=? AND job_id=? AND (state='completed' OR expires_at>CURRENT_TIMESTAMP)`).bind(uploadId, jobId).first<ArtifactUpload>();
}

function validArtifactName(name: string) {
  return !name.startsWith('/') && !name.startsWith('\\') && !name.includes('\0') && !name.split(/[\\/]/).some((part) => part === '..' || part === '');
}

async function discardExpiredArtifactUploads(env: Env) {
  const expired = await env.DB.prepare("SELECT id,object_key AS objectKey,multipart_upload_id AS multipartUploadId FROM artifact_uploads WHERE state='uploading' AND expires_at<=CURRENT_TIMESTAMP LIMIT 4").all<{ id: string; objectKey: string; multipartUploadId: string }>();
  for (const upload of expired.results) {
    try {
      await env.OBJECTS.resumeMultipartUpload(upload.objectKey, upload.multipartUploadId).abort();
      await env.DB.prepare('DELETE FROM artifact_uploads WHERE id=?').bind(upload.id).run();
    } catch (error) {
      console.error('expired artifact upload cleanup deferred', error);
    }
  }
}

export async function completeJob(request: Request, env: Env, runner: Runner, jobId: string): Promise<Response> {
  const job = await ownsLease(env, runner, jobId, request.headers.get('x-marl-job-lease'));
  const body = await readJson(request, completeJobBody);
  if (!job || !body || !['success', 'failure', 'canceled'].includes(String(body.state)) || !Number.isInteger(body.exitCode)) return problem(409, 'lease_lost', 'This job lease is no longer valid.');
  const state = job.cancelRequested || job.runState === 'canceled' ? 'canceled' : String(body.state);
  const summary = state === 'canceled'
    ? job.cancellationReason === 'superseded'
      ? 'Superseded by a newer push.'
      : job.cancellationReason === 'developer'
        ? 'Canceled by a developer.'
        : typeof body.summary === 'string' ? body.summary.slice(0, 1000) : 'Canceled by the runner.'
    : typeof body.summary === 'string' ? body.summary.slice(0, 1000) : '';
  await env.DB.batch([
    env.DB.prepare(`UPDATE jobs SET state=?,exit_code=?,completed_at=CURRENT_TIMESTAMP,lease_token_hash=NULL,lease_expires_at=NULL WHERE id=? AND state='running'`).bind(state, state === 'canceled' ? 130 : body.exitCode, jobId),
    env.DB.prepare(`UPDATE runners SET active_jobs=MAX(active_jobs-1,0),last_seen_at=CURRENT_TIMESTAMP WHERE id=?`).bind(runner.id),
    env.DB.prepare(`UPDATE checks SET state=?,summary=?,completed_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE repository_id=(SELECT repository_id FROM runs WHERE id=?) AND commit_id=(SELECT commit_id FROM runs WHERE id=?) AND name=(SELECT check_name FROM jobs WHERE id=?)`).bind(state, summary, job.runId, job.runId, jobId)
  ]);
  for (let depth = 0; depth < 32; depth += 1) {
    const canceled = await env.DB.prepare(`UPDATE jobs SET state='canceled',completed_at=CURRENT_TIMESTAMP WHERE run_id=? AND state='queued' AND EXISTS (SELECT 1 FROM json_each(jobs.needs_json) AS need JOIN jobs AS dependency ON dependency.run_id=jobs.run_id AND dependency.job_key=need.value WHERE dependency.state IN ('failure','canceled'))`).bind(job.runId).run();
    if (!canceled.meta?.changes) break;
  }
  await env.DB.prepare(`UPDATE checks SET state='canceled',summary='A required job did not succeed.',completed_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE repository_id=(SELECT repository_id FROM runs WHERE id=?) AND commit_id=(SELECT commit_id FROM runs WHERE id=?) AND name IN (SELECT check_name FROM jobs WHERE run_id=? AND state='canceled') AND state='queued'`).bind(job.runId, job.runId, job.runId).run();
  const remaining = await env.DB.prepare(`SELECT state,COUNT(*) AS count FROM jobs WHERE run_id=? GROUP BY state`).bind(job.runId).all<{ state: string; count: number }>();
  const states = new Set(remaining.results.map((row) => row.state));
  const runState = states.has('failure') ? 'failure' : states.has('canceled') ? 'canceled' : states.has('running') ? 'running' : states.has('queued') ? 'queued' : 'success';
  await env.DB.prepare(`UPDATE runs SET state=?,completed_at=CASE WHEN ? IN ('success','failure','canceled') THEN CURRENT_TIMESTAMP ELSE NULL END WHERE id=?`).bind(runState, runState, job.runId).run();
  await notifyPullsForCommit(env, job.repositoryId, job.commitId);
  return json({ completed: true, runState });
}

export async function authorizeRunnerGit(env: Env, runner: Runner, owner: string, name: string): Promise<Response> {
  const allowed = await env.DB.prepare(`SELECT repositories.id, repositories.visibility FROM repositories JOIN organizations ON organizations.id=repositories.organization_id WHERE organizations.slug=? COLLATE NOCASE AND repositories.name=? COLLATE NOCASE AND repositories.organization_id=?`).bind(owner, name, runner.organizationId).first<{ id: string; visibility: string }>();
  return allowed ? json({ repositoryId: allowed.id, visibility: allowed.visibility, read: true, write: false }) : problem(403, 'git_access_denied', 'This runner cannot read the repository.');
}
