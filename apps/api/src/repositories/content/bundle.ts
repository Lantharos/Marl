import type { Principal } from '../../auth/principal';
import type { Env } from '../../core/platform';
import { requestGitGateway } from '../../git/gateway';
import { problem } from '../../http/http';
import { authorizeRepository } from '../access/access';

export async function downloadRepositoryBundle(env: Env, principal: Principal | null, owner: string, name: string) {
  const repository = await authorizeRepository(env, principal, owner, name, 'repository.read');
  if (!repository) return problem(404, 'repository_not_found', 'Repository not found.');
  const response = await requestGitGateway(
    env,
    '/_marl/bundle',
    { owner, repository: name },
    { attempts: 2, timeoutMs: 300_000 }
  ).catch(() => null);
  if (response?.status === 404) return problem(404, 'repository_empty', 'This repository has no commits yet.');
  if (!response?.ok || !response.body)
    return problem(502, 'repository_bundle_unavailable', 'The repository history could not be packaged.');
  const headers = new Headers(response.headers);
  headers.set('content-disposition', `attachment; filename="${owner}-${name}.bundle"`);
  return new Response(response.body, { status: 200, headers });
}
