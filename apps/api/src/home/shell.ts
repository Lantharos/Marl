import type { Principal } from '../auth/principal';
import { json } from '../http/http';
import { listRepositoryOwners } from '../identity/organizations';
import type { Env } from '../core/platform';
import { listShellRepositories } from '../repositories/repositories';

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
