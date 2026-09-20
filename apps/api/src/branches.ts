import { auditStatement } from './audit';
import type { Principal } from './auth';
import { validBranchName } from './domain';
import { requestGitGateway } from './git-gateway';
import { json, problem, readJsonValue } from './http';
import type { Env } from './platform';
import { authorizeRepository } from './repository-access';

export async function deleteBranch(request: Request, env: Env, principal: Principal, owner: string, name: string, branch: string) {
  const repository = await authorizeRepository(env, principal, owner, name, 'repository.push');
  if (!repository) return problem(404, 'repository_not_found', 'Repository not found.');
  const body = await readJsonValue(request, 4096) as { expectedCommitId?: unknown } | null;
  if (!validBranchName(branch) || !body || typeof body.expectedCommitId !== 'string' || !/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(body.expectedCommitId)) return problem(422, 'invalid_branch', 'Choose a branch and its current commit.');
  if (branch === repository.defaultBranch) return problem(409, 'default_branch', 'The default branch cannot be deleted.');
  const [rule, activePull] = await Promise.all([
    env.DB.prepare("SELECT pattern FROM branch_rules WHERE repository_id=? AND pattern IN (?, '*') LIMIT 1").bind(repository.id, branch).first(),
    env.DB.prepare("SELECT number FROM pull_requests WHERE state IN ('draft','open') AND ((repository_id=? AND target_branch=?) OR (COALESCE(source_repository_id,repository_id)=? AND source_branch=?)) LIMIT 1").bind(repository.id, branch, repository.id, branch).first<{ number: number }>()
  ]);
  if (rule) return problem(409, 'protected_branch', 'This branch is protected by a branch rule.');
  if (activePull) return problem(409, 'branch_in_use', 'Merge or close the open pulls using this branch before deleting it.');
  const response = await requestGitGateway(env, '/_marl/branches/delete', { owner, repository: name, repositoryId: repository.id, branch, expectedCommitId: body.expectedCommitId, actorId: principal.id }, { attempts: 2, timeoutMs: 30_000 }).catch(() => null);
  if (!response?.ok) {
    await response?.body?.cancel();
    return response?.status === 409
      ? problem(409, 'branch_changed', 'This branch changed. Refresh before deleting it.')
      : problem(502, 'branch_delete_failed', 'The branch could not be deleted. Try again.');
  }
  await response.body?.cancel();
  await auditStatement(env, { organizationId: repository.organizationId, repositoryId: repository.id, actor: principal, action: 'repository.branch.deleted', subjectType: 'branch', subjectId: branch, details: { commitId: body.expectedCommitId } }).run();
  return json({ deleted: true, branch });
}
