import { workflowCheckName } from './check-provenance';
import { identifier } from './domain';
import type { Env } from './platform';
import { notifyPullsForCommit } from './pull-realtime';
import { runSelect, type RunJob } from './runs';

export type QueueRun = {
  repositoryId: string;
  workflowId: string;
  name: string;
  trigger: 'workflow_dispatch' | 'retry' | 'push' | 'pull_request';
  branch: string;
  commitId: string;
  actorId: string | null;
  jobs: RunJob[];
  supersede?: boolean;
  pullId?: string | null;
  checkoutRepositoryId?: string;
  untrusted?: boolean;
};

export async function queueRun(env: Env, input: QueueRun): Promise<Record<string, unknown> | null> {
  const runId = identifier('run');
  const checkout = input.checkoutRepositoryId ?? input.repositoryId;
  const automatic = input.trigger === 'push' || input.trigger === 'pull_request';
  const supersede = input.supersede === true && automatic;
  const pipeline = `repository_id=? AND workflow_id=? AND branch=? AND trigger_name=? AND pull_request_id IS ? AND state IN ('queued','running')`;
  const values = [input.repositoryId, input.workflowId, input.branch, input.trigger, input.pullId ?? null];
  const statements = supersede ? [
    env.DB.prepare(`UPDATE jobs SET state='canceled',completed_at=CURRENT_TIMESTAMP WHERE state='queued' AND run_id IN (SELECT id FROM runs WHERE ${pipeline})`).bind(...values),
    env.DB.prepare(`UPDATE jobs SET cancel_requested=1 WHERE state='running' AND run_id IN (SELECT id FROM runs WHERE ${pipeline})`).bind(...values),
    env.DB.prepare(`UPDATE checks SET state='canceled',summary='Superseded by a newer push.',completed_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id IN (SELECT check_row.id FROM runs JOIN jobs ON jobs.run_id=runs.id JOIN checks AS check_row ON check_row.repository_id=COALESCE(runs.checkout_repository_id,runs.repository_id) AND check_row.commit_id=runs.commit_id AND check_row.producer_repository_id=runs.repository_id AND check_row.producer_workflow_id=runs.workflow_id AND check_row.producer_job_key=jobs.job_key WHERE runs.id IN (SELECT id FROM runs WHERE ${pipeline}))`).bind(...values),
    env.DB.prepare(`UPDATE runs SET state='canceled',approval_required=0,cancellation_reason='superseded',completed_at=CURRENT_TIMESTAMP WHERE ${pipeline} RETURNING commit_id AS commitId`).bind(...values)
  ] : [];
  const supersededIndex = statements.length - 1;
  statements.push(env.DB.prepare(`INSERT INTO runs (id,repository_id,workflow_id,number,name,trigger_name,branch,commit_id,actor_id,pull_request_id,checkout_repository_id,untrusted,approval_required,approved_by,approved_at)
    SELECT ?,?,?,COALESCE(MAX(number),0)+1,?,?,?,?,?,?,?,?,
      CASE WHEN ? THEN (SELECT require_check_approval FROM repositories WHERE id=?) ELSE 0 END,?,CASE WHEN ? THEN CURRENT_TIMESTAMP ELSE NULL END FROM runs WHERE repository_id=?`).bind(runId, input.repositoryId, input.workflowId, input.name, input.trigger, input.branch, input.commitId, input.actorId, input.pullId ?? null, checkout, Number(Boolean(input.untrusted)), Number(automatic && Boolean(input.untrusted)), input.repositoryId, automatic ? null : input.actorId, Number(!automatic), input.repositoryId));
  for (const job of input.jobs) {
    const checkName = workflowCheckName(input.name, job.name);
    const release = !input.untrusted && job.release ? { ...job.release, tag: job.release.tag.replaceAll('$MARL_COMMIT', input.commitId).replaceAll('$MARL_BRANCH', input.branch) } : undefined;
    statements.push(env.DB.prepare(`INSERT INTO jobs (id,run_id,job_key,name,check_name,required_labels_json,steps_json,environment_json,artifact_paths_json,release_json,runtime_json,needs_json) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).bind(identifier('job'), runId, job.key, job.name, checkName, JSON.stringify(job.labels), JSON.stringify(job.steps), JSON.stringify(job.environment), JSON.stringify(job.artifacts), release ? JSON.stringify(release) : null, JSON.stringify(job.runtime), JSON.stringify(job.needs)));
    statements.push(env.DB.prepare(`INSERT INTO checks (id,repository_id,commit_id,producer_repository_id,producer_workflow_id,producer_job_key,name,state,summary)
      SELECT ?,?,?,?,?,?,?,'queued',CASE WHEN approval_required=1 THEN 'Waiting for permission to run checks.' ELSE 'Waiting for a self-hosted runner.' END FROM runs WHERE id=?
      ON CONFLICT(repository_id,commit_id,producer_repository_id,producer_workflow_id,producer_job_key) DO UPDATE SET name=excluded.name,state='queued',summary=excluded.summary,started_at=NULL,completed_at=NULL,updated_at=CURRENT_TIMESTAMP`).bind(identifier('check'), checkout, input.commitId, input.repositoryId, input.workflowId, job.key, checkName, runId));
  }
  let results;
  try { results = await env.DB.batch<{ commitId?: string }>(statements); }
  catch (error) {
    if (input.trigger === 'pull_request' && String(error).includes('pull_head_changed')) return null;
    if (input.trigger === 'pull_request' && String(error).includes('UNIQUE constraint')) {
      const existing = await env.DB.prepare(runSelect("WHERE runs.pull_request_id=? AND runs.workflow_id=? AND runs.commit_id=? AND runs.trigger_name='pull_request'")).bind(input.pullId, input.workflowId, input.commitId).first<Record<string, unknown>>();
      if (existing) return existing;
    }
    throw error;
  }
  const superseded = supersede ? (results[supersededIndex]?.results ?? []).map((row) => String(row.commitId)) : [];
  await Promise.all([...new Set([...superseded, input.commitId])].map((commitId) => notifyPullsForCommit(env, input.repositoryId, commitId)));
  return env.DB.prepare(runSelect('WHERE runs.id=?')).bind(runId).first<Record<string, unknown>>();
}
