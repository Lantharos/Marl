import type { GitEdgeEnv } from './env';

export type GitAuthorization = { repositoryId: string; storageKey: string; organizationId: string; read: boolean; write: boolean };

export async function authorizeGit(request: Request, env: GitEdgeEnv, owner: string, repository: string, service: 'git-upload-pack' | 'git-receive-pack') {
  const headers = new Headers();
  const authorization = request.headers.get('authorization');
  if (authorization) headers.set('authorization', authorization);
  const gateway = request.headers.get('x-sty-gateway-token');
  if (gateway) headers.set('x-sty-gateway-token', gateway);
  const url = new URL('/api/v1/git/authorize', env.STY_API_URL);
  url.searchParams.set('owner', owner);
  url.searchParams.set('repository', repository);
  url.searchParams.set('service', service);
  const response = await fetch(url, { headers });
  if (!response.ok) throw new AuthorizationError(response.status);
  return response.json<GitAuthorization>();
}

export class AuthorizationError extends Error {
  constructor(public status: number) { super('Git access denied.'); }
}
