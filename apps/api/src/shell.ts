import type { Principal } from './auth';
import { json } from './http';
import { listRepositoryOwners } from './organizations';
import type { Env } from './platform';
import { listShellRepositories } from './repositories';

export async function getShell(env: Env, principal: Principal): Promise<Response> {
  const [repositories, repositoryOwners] = await Promise.all([
    listShellRepositories(env, principal),
    listRepositoryOwners(env, principal)
  ]);
  return json({ user: principal, repositories, repositoryOwners });
}
