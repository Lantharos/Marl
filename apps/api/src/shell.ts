import type { Principal } from './auth';
import { json } from './http';
import { listRepositoryOwners } from './organizations';
import type { Env } from './platform';
import { listShellRepositories } from './repositories';

export async function shellData(env: Env, principal: Principal) {
  const [repositories, repositoryOwners] = await Promise.all([
    listShellRepositories(env, principal),
    listRepositoryOwners(env, principal)
  ]);
  return { repositories, repositoryOwners };
}

export async function getShell(env: Env, principal: Principal): Promise<Response> {
  return json({ user: principal, ...(await shellData(env, principal)) });
}
