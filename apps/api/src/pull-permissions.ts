import type { Principal } from './auth';
import type { BranchRule } from './branch-rules';
import { repositoryCan, type RepositoryAccess } from './repository-access';

export function pullMergePermission(repository: RepositoryAccess, principal: Principal | null, authorId: string, rule: BranchRule) {
  if (repositoryCan(repository, principal, 'repository.push')) return { allowed: true, authorMerge: false };
  const tokenCanWrite = principal?.authType !== 'token' || Boolean(principal.tokenScopes?.some((scope) => scope === 'repo:write' || scope === 'repo:admin'));
  const allowed = Boolean(!repository.archivedAt && principal?.id === authorId && tokenCanWrite && rule.allowAuthorMerge && repositoryCan(repository, principal, 'repository.read'));
  return { allowed, authorMerge: allowed };
}
