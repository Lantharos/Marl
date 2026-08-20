import { Container, ContainerProxy, getContainer } from '@cloudflare/containers';
import { authorizeGit, AuthorizationError } from './authorization';
import { handleCompatibilityPush } from './compatibility';
import type { GitEdgeEnv } from './env';
import { hydrateRepository } from './hydration';
import { handleNativePush, nativePushRoute } from './native-push';
import { readPackedObject } from './pack-reader';
import { forkRepositoryStorage } from './fork-storage';
export { OrganizationQuotaObject } from './organization-quota-object';
export { RepositoryStateObject } from './repository-state-object';
export { UploadSessionObject } from './upload-session-object';
export { CompactionObject } from './compaction';
export { RepositoryIndexObject } from './indexing';

type RepositoryRoute = { owner: string; repository: string; writes: boolean };

const INTERNAL_REPOSITORY_ROUTES = new Set([
  '/_marl/blob',
  '/_marl/commit',
  '/_marl/compare',
  '/_marl/merge',
  '/_marl/patch',
  '/_marl/pulls/pin',
  '/_marl/tree'
]);

export class GitContainer extends Container<GitEdgeEnv> {
  defaultPort = 8788;
  sleepAfter = '1m';
  enableInternet = true;
  envVars = {
    MARL_API_URL: this.env.MARL_API_URL,
    MARL_GIT_GATEWAY_TOKEN: this.env.MARL_GIT_GATEWAY_TOKEN,
    MARL_GIT_LISTEN: '0.0.0.0:8788',
    MARL_GIT_ROOT: '/var/lib/marl/repositories',
    MARL_GIT_LOCAL: '0'
  };
}

export class ValidatorContainer extends GitContainer { enableInternet = false; }
export class MaintenanceContainer extends GitContainer { enableInternet = false; }

export { ContainerProxy };

export default {
  async fetch(request: Request, env: GitEdgeEnv): Promise<Response> {
    try {
      if (new URL(request.url).pathname === '/_marl/repositories/relocate' && request.method === 'POST') {
        return new Response(null, { status: request.headers.get('x-marl-gateway-token') === env.MARL_GIT_GATEWAY_TOKEN ? 204 : 404 });
      }
      if (new URL(request.url).pathname === '/_marl/repositories/fork' && request.method === 'POST') return forkRepositoryStorage(request, env);
      if (new URL(request.url).pathname === '/_marl/object' && request.method === 'POST') {
        if (request.headers.get('x-marl-gateway-token') !== env.MARL_GIT_GATEWAY_TOKEN) return new Response(null, { status: 404 });
        const body = await request.json<{ repositoryId?: unknown; objectId?: unknown }>().catch(() => null);
        if (!body || typeof body.repositoryId !== 'string' || typeof body.objectId !== 'string' || !/^[0-9a-f]{40,64}$/.test(body.objectId)) return new Response(null, { status: 422 });
        const object = await readPackedObject(env, body.repositoryId, body.objectId);
        return new Response(new Uint8Array(object.bytes).buffer, { headers: { 'content-type': 'application/octet-stream', 'content-length': String(object.bytes.byteLength), 'x-marl-git-object-type': object.kind, 'cache-control': 'private, max-age=31536000, immutable' } });
      }
      const nativeRoute = nativePushRoute(request);
      if (nativeRoute) return handleNativePush(request, env, nativeRoute);
      const route = await repositoryRoute(request);
      if (!route) return new Response('Repository not found\n', { status: 404 });
      const authorization = await authorizeGit(request, env, route.owner, route.repository, route.writes ? 'git-receive-pack' : 'git-upload-pack');
      const container = getContainer(env.GIT_CONTAINERS, authorization.storageKey);
      if (new URL(request.url).pathname === '/_marl/compare' || new URL(request.url).pathname === '/_marl/pulls/pin') {
        const body = await request.clone().json<{ sourceOwner?: unknown; sourceRepository?: unknown; sourceRepositoryId?: unknown }>().catch(() => null);
        if (body && typeof body.sourceOwner === 'string' && typeof body.sourceRepository === 'string' && typeof body.sourceRepositoryId === 'string' && safeSegment(body.sourceOwner) && safeSegment(body.sourceRepository)) await hydrateRepository(container, env, body.sourceOwner, body.sourceRepository, body.sourceRepositoryId);
      }
      if (route.writes) return handleCompatibilityPush(request, container, env, route.owner, route.repository);
      await hydrateRepository(container, env, route.owner, route.repository, authorization.storageKey);
      return container.fetch(request);
    } catch (error) {
      if (error instanceof AuthorizationError) {
        const response = new Response('Git access denied\n', { status: error.status });
        if (error.status === 401) response.headers.set('www-authenticate', 'Basic realm="Marl", charset="UTF-8"');
        return response;
      }
      console.error(error);
      return new Response('Git gateway failed\n', { status: 500 });
    }
  }
} satisfies ExportedHandler<GitEdgeEnv>;

async function repositoryRoute(request: Request): Promise<RepositoryRoute | null> {
  const url = new URL(request.url);
  if (url.pathname.startsWith('/_marl/')) {
    if (request.method !== 'POST' || !INTERNAL_REPOSITORY_ROUTES.has(url.pathname)) return null;
    const body = await request.clone().json<Record<string, unknown>>().catch(() => null);
    if (!body || typeof body.owner !== 'string' || typeof body.repository !== 'string' || !safeSegment(body.owner) || !safeSegment(body.repository)) return null;
    return { owner: body.owner, repository: body.repository, writes: url.pathname === '/_marl/merge' || url.pathname === '/_marl/pulls/pin' };
  }
  const match = url.pathname.match(/^\/([^/]+)\/([^/]+)\.git\//);
  if (!match || !safeSegment(match[1]) || !safeSegment(match[2])) return null;
  const service = url.searchParams.get('service') ?? url.pathname.split('/').at(-1);
  return { owner: match[1], repository: match[2], writes: service === 'git-receive-pack' };
}

function safeSegment(value: string | undefined): value is string {
  return Boolean(value && value !== '.' && value !== '..' && /^[a-zA-Z0-9._-]+$/.test(value));
}
