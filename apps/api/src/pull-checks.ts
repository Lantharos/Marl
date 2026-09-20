import type { Principal } from './auth';
import { auditStatement } from './audit';
import { json, problem, readJson } from './http';
import { pipe, string, minLength, maxLength, strictObject } from 'valibot';
import type { Env } from './platform';
import { authorizeRepository, authorizeRepositoryId } from './repository-access';
import { notifyPullsForCommit } from './pull-realtime';
import { parseRunJobs, queueRun } from './runs';
import { workflowTriggeredBy } from './workflow-triggers';

async function trustedContributor(env: Env, repositoryId: string, userId: string | null) {
  if (!userId) return false;
  const user = await env.DB.prepare('SELECT id,handle,display_name AS displayName,email,avatar_url AS avatarUrl FROM users WHERE id=?').bind(userId).first<Omit<Principal, 'authType'>>();
  return Boolean(user && await authorizeRepositoryId(env, { ...user, authType: 'session' }, repositoryId, 'repository.push'));
}

export async function queuePullWorkflows(env: Env, pullId: string) {
  const pull = await env.DB.prepare(`SELECT id,repository_id AS repositoryId,COALESCE(source_repository_id,repository_id) AS checkoutRepositoryId,source_commit_id AS commitId,source_branch AS sourceBranch,target_branch AS targetBranch,author_id AS authorId,COALESCE((SELECT actor_id FROM pull_request_events JOIN pull_timeline ON pull_timeline.entity_id=pull_request_events.id AND pull_timeline.kind='event' WHERE pull_request_events.pull_request_id=pull_requests.id AND pull_request_events.kind IN ('commits_added','head_updated') AND json_extract(details,'$.head')=pull_requests.source_commit_id ORDER BY pull_timeline.sequence DESC LIMIT 1),author_id) AS actorId FROM pull_requests WHERE id=? AND state='open'`).bind(pullId).first<{ id: string; repositoryId: string; checkoutRepositoryId: string; commitId: string; sourceBranch: string; targetBranch: string; authorId: string; actorId: string }>();
  if (!pull) return;
  const workflows = await env.DB.prepare(`SELECT workflows.id,workflows.name,workflows.jobs_json AS jobsJson,workflows.trigger_config_json AS triggerConfigJson,workflows.supersede_pushes AS supersede FROM workflows WHERE repository_id=? AND branch=? AND active=1 AND status='valid' AND jobs_json IS NOT NULL AND NOT EXISTS (SELECT 1 FROM runs WHERE runs.pull_request_id=? AND runs.workflow_id=workflows.id AND runs.commit_id=? AND runs.trigger_name='pull_request')`).bind(pull.repositoryId, pull.targetBranch, pullId, pull.commitId).all<{ id: string; name: string; jobsJson: string; triggerConfigJson: string; supersede: number }>();
  const matching = workflows.results.filter((workflow) => workflowTriggeredBy(JSON.parse(workflow.triggerConfigJson), 'pull_request', pull.targetBranch));
  if (!matching.length) return;
  const [authorTrusted, actorTrusted] = await Promise.all([trustedContributor(env, pull.repositoryId, pull.authorId), trustedContributor(env, pull.repositoryId, pull.actorId)]);
  for (const workflow of matching) {
    const parsed = parseRunJobs(JSON.parse(workflow.jobsJson));
    if (parsed.error) continue;
    await queueRun(env, { repositoryId: pull.repositoryId, checkoutRepositoryId: pull.checkoutRepositoryId, pullId, workflowId: workflow.id, name: workflow.name, trigger: 'pull_request', branch: pull.sourceBranch, commitId: pull.commitId, actorId: pull.actorId, jobs: parsed.jobs, untrusted: !authorTrusted || !actorTrusted, supersede: Boolean(workflow.supersede) });
  }
}

export async function queuePullsForIndexedRepository(env: Env, repositoryId: string, branches: string[]) {
  const ids = new Set<string>();
  for (let offset = 0; offset < branches.length; offset += 45) {
    const chunk = branches.slice(offset, offset + 45);
    const placeholders = chunk.map(() => '?').join(',');
    const pulls = await env.DB.prepare(`SELECT id FROM pull_requests WHERE state='open' AND ((repository_id=? AND target_branch IN (${placeholders})) OR (COALESCE(source_repository_id,repository_id)=? AND source_branch IN (${placeholders})))`).bind(repositoryId, ...chunk, repositoryId, ...chunk).all<{ id: string }>();
    for (const pull of pulls.results) ids.add(pull.id);
  }
  for (const id of ids) await queuePullWorkflows(env, id);
}

export async function pullChecksApproval(env: Env, pullId: string, canApprove: boolean) {
  const row = await env.DB.prepare(`SELECT COUNT(*) AS waiting FROM runs JOIN pull_requests ON pull_requests.id=runs.pull_request_id WHERE pull_requests.id=? AND runs.commit_id=pull_requests.source_commit_id AND runs.approval_required=1 AND runs.state='queued'`).bind(pullId).first<{ waiting: number }>();
  return { waiting: Number(row?.waiting ?? 0), canApprove };
}

export async function approveRunChecks(env: Env, principal: Principal, owner: string, name: string, number: number) {
  const repository = await authorizeRepository(env, principal, owner, name, 'repository.push');
  if (!repository) return problem(404, 'repository_not_found', 'Repository not found.');
  const run = await env.DB.prepare(`SELECT id,commit_id AS commitId FROM runs WHERE repository_id=? AND number=? AND approval_required=1 AND state='queued' AND EXISTS (SELECT 1 FROM pull_requests WHERE id=runs.pull_request_id AND source_commit_id=runs.commit_id AND state='open')`).bind(repository.id, number).first<{ id: string; commitId: string }>();
  if (!run) return problem(409, 'run_not_waiting', 'This run is no longer waiting for approval.');
  await releaseRuns(env, principal, repository, [run.id]);
  await notifyPullsForCommit(env, repository.id, run.commitId);
  return json({ approved: true });
}

const headBody = strictObject({ commitId: pipe(string(), minLength(40), maxLength(64)) });

export async function approvePullChecks(request: Request, env: Env, principal: Principal, owner: string, name: string, number: number) {
  const repository = await authorizeRepository(env, principal, owner, name, 'repository.push');
  if (!repository) return problem(404, 'repository_not_found', 'Repository not found.');
  const input = await readJson(request, headBody);
  if (!input) return problem(422, 'invalid_head', 'Choose the revision to run checks for.');
  const pull = await env.DB.prepare("SELECT id FROM pull_requests WHERE repository_id=? AND number=? AND source_commit_id=? AND state='open'").bind(repository.id, number, input.commitId).first<{ id: string }>();
  if (!pull) return problem(409, 'pull_head_changed', 'The pull changed. Review the latest revision before running checks.');
  const runs = await env.DB.prepare("SELECT id FROM runs WHERE pull_request_id=? AND commit_id=? AND approval_required=1 AND state='queued'").bind(pull.id, input.commitId).all<{ id: string }>();
  if (runs.results.length) await releaseRuns(env, principal, repository, runs.results.map((run) => run.id));
  await notifyPullsForCommit(env, repository.id, input.commitId);
  return json({ approved: true });
}

async function releaseRuns(env: Env, principal: Principal, repository: { id: string; organizationId: string }, ids: string[]) {
  for (let offset = 0; offset < ids.length; offset += 40) {
    const chunk = ids.slice(offset, offset + 40);
    const placeholders = chunk.map(() => '?').join(',');
    await env.DB.batch([
      env.DB.prepare(`UPDATE runs SET approval_required=0,approved_by=?,approved_at=CURRENT_TIMESTAMP WHERE repository_id=? AND id IN (${placeholders}) AND approval_required=1 AND state='queued' AND EXISTS (SELECT 1 FROM pull_requests WHERE id=runs.pull_request_id AND source_commit_id=runs.commit_id AND state='open')`).bind(principal.id, repository.id, ...chunk),
      env.DB.prepare(`UPDATE checks SET summary='Waiting for a self-hosted runner.',updated_at=CURRENT_TIMESTAMP WHERE id IN (SELECT check_row.id FROM runs JOIN jobs ON jobs.run_id=runs.id JOIN checks AS check_row ON check_row.repository_id=COALESCE(runs.checkout_repository_id,runs.repository_id) AND check_row.commit_id=runs.commit_id AND check_row.producer_repository_id=runs.repository_id AND check_row.producer_workflow_id=runs.workflow_id AND check_row.producer_job_key=jobs.job_key WHERE runs.id IN (${placeholders}) AND runs.approval_required=0 AND runs.approved_by=?) AND state='queued'`).bind(...chunk, principal.id),
      auditStatement(env, { organizationId: repository.organizationId, repositoryId: repository.id, actor: principal, action: 'checks.approved', subjectType: 'repository', subjectId: repository.id, details: { runIds: chunk } })
    ]);
  }
}
