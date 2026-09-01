import { readBoundedJson } from './bounded-body';
import type { GitEdgeEnv } from './env';

export type GitAuthorization = {
  repositoryId: string;
  storageKey: string;
  organizationId: string;
  actorId?: string;
  read: boolean;
  write: boolean;
};

export async function authorizeGit(request: Request, env: GitEdgeEnv, owner: string, repository: string, service: 'git-upload-pack' | 'git-receive-pack') {
  const headers = new Headers();
  const authorization = request.headers.get('authorization');
  if (authorization) headers.set('authorization', authorization);
  const gateway = request.headers.get('x-marl-gateway-token');
  if (gateway) headers.set('x-marl-gateway-token', gateway);
  const actor = request.headers.get('x-marl-actor-id');
  if (gateway && actor) headers.set('x-marl-actor-id', actor);
  const url = new URL('/api/v1/git/authorize', 'http://marl-api.internal');
  url.searchParams.set('owner', owner);
  url.searchParams.set('repository', repository);
  url.searchParams.set('service', service);
  const response = await env.MARL_API.fetch(url, { headers });
  if (!response.ok) throw new AuthorizationError(response.status);
  const body = await readBoundedJson<GitAuthorization>(response, 64 * 1024);
  if (!body) throw new AuthorizationError(502);
  return body;
}

export class AuthorizationError extends Error {
  constructor(public status: number) {
    super('Git access denied.');
  }
}
