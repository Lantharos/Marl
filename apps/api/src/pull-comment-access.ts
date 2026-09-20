import type { Principal } from './auth';
import type { Env } from './platform';
import { authorizeRepositoryId } from './repository-access';

export async function canDeletePullComment(env: Env, principal: Principal, pullId: string, authorId: string) {
  const pull = await env.DB.prepare('SELECT repository_id AS repositoryId FROM pull_requests WHERE id=?').bind(pullId).first<{ repositoryId: string }>();
  return Boolean(pull && await authorizeRepositoryId(env, principal, pull.repositoryId, principal.id === authorId ? 'repository.read' : 'repository.maintain'));
}
