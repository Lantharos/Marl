import type { Principal } from '../../auth/principal';
import { branchRuleFor } from '../../repositories/branch-rules';
import { json, problem, readJson } from '../../http/http';
import type { Env } from '../../core/platform';
import { pullSelect, type PullRow } from '../context';
import { pullMergePermission } from '../permissions';
import { mergeBody } from '../../http/request-schemas';
import { authorizeRepository } from '../../repositories/access/access';
import { publishMergeCommit } from './publish';
import { mergeBlocker } from './readiness';
import { recordMerge } from './record';

export async function mergePull(
  request: Request,
  env: Env,
  principal: Principal,
  owner: string,
  name: string,
  number: number
): Promise<Response> {
  const repository = await authorizeRepository(env, principal, owner, name, 'repository.read');
  if (!repository) return problem(404, 'repository_not_found', 'Repository not found.');
  const pull = await env.DB.prepare(`${pullSelect} WHERE pull_requests.repository_id = ? AND pull_requests.number = ?`)
    .bind(repository.id, number)
    .first<PullRow>();
  if (!pull) return problem(404, 'pull_request_not_found', 'Pull request not found.');
  const rule = await branchRuleFor(env, repository.id, pull.targetBranch);
  const permission = pullMergePermission(repository, principal, pull.authorId, rule);
  if (!permission.allowed) return problem(403, 'merge_not_allowed', 'You do not have permission to merge this pull.');
  if (pull.state === 'merged' && pull.mergedCommitId) return json({ merged: true, commitId: pull.mergedCommitId });
  if (pull.state !== 'open') return problem(409, 'pull_request_not_open', 'Pull request is not open.');
  const body = await readJson(request, mergeBody);
  if (!body || body.commitId !== pull.sourceCommitId)
    return problem(409, 'pull_head_changed', 'The pull changed. Check the latest revision before merging.');
  const method = body.method ?? 'merge';
  if (rule.mergeQueue)
    return problem(409, 'merge_queue_required', `Pulls into ${pull.targetBranch} merge through the merge queue.`);
  const blocker = await mergeBlocker(env, principal, repository, pull, rule, permission, method);
  if (blocker) return blocker;
  const result = await publishMergeCommit(env, {
    principal,
    repository,
    pull,
    method: method,
    targetCommitId: pull.targetCommitId
  });
  if ('status' in result) return problem(result.status, result.code, result.message);
  const update = await recordMerge(env, principal, repository, pull, method, {
    ...result,
    targetCommitId: pull.targetCommitId
  });
  return json({ merged: true, commitId: result.commitId, update });
}
