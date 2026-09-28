import type { Env } from '../../core/platform';
import { parseRunJobs } from '../../ci/runs/jobs';
import { queueRun } from '../../ci/runs/queue';
import type { BranchRule } from '../../repositories/branch-rules';
import { commitChecks } from '../merge/readiness';
import { requiredCheckStates } from '../merge/requirements';

export type QueueVerdict = 'pending' | 'passed' | 'failed';

export async function startQueueChecks(
  env: Env,
  input: { repositoryId: string; rule: BranchRule; branch: string; commitId: string; actorId: string }
) {
  const workflowIds = [...new Set(input.rule.requiredChecks.map((check) => check.workflowId))];
  if (!workflowIds.length) return;
  const workflows = await env.DB.prepare(
    `SELECT id,name,jobs_json AS jobsJson FROM workflows WHERE repository_id=? AND active=1 AND status='valid' AND jobs_json IS NOT NULL AND id IN (${workflowIds.map(() => '?').join(',')})`
  )
    .bind(input.repositoryId, ...workflowIds)
    .all<{ id: string; name: string; jobsJson: string }>();
  for (const workflow of workflows.results) {
    const parsed = parseRunJobs(JSON.parse(workflow.jobsJson));
    if (parsed.error) continue;
    await queueRun(env, {
      repositoryId: input.repositoryId,
      workflowId: workflow.id,
      name: workflow.name,
      trigger: 'merge_queue',
      branch: input.branch,
      commitId: input.commitId,
      actorId: input.actorId,
      jobs: parsed.jobs
    });
  }
}

export async function queueVerdict(
  env: Env,
  repositoryId: string,
  rule: BranchRule,
  commitId: string
): Promise<{ verdict: QueueVerdict; failed?: string }> {
  const checks = await commitChecks(env, repositoryId, commitId, repositoryId);
  const states = requiredCheckStates(rule, checks.results);
  const failed = states.find((check) => check.state && !['queued', 'running', 'success'].includes(check.state));
  if (failed) return { verdict: 'failed', failed: failed.name };
  return { verdict: states.every((check) => check.state === 'success') ? 'passed' : 'pending' };
}
