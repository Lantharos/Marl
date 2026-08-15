import { Container, ContainerProxy, getContainer } from '@cloudflare/containers';
import { authorizeGit, AuthorizationError } from './authorization';
import { handleCompatibilityPush } from './compatibility';
import type { GitEdgeEnv } from './env';
import { hydrateRepository } from './hydration';
import { handleNativePush, nativePushRoute } from './native-push';
export { OrganizationQuotaObject, RepositoryStateObject, UploadSessionObject } from './state-objects';
export { CompactionObject } from './compaction';
export { RepositoryIndexObject } from './indexing';

type RepositoryRoute = { owner: string; repository: string; writes: boolean };

export class GitContainer extends Container<GitEdgeEnv> {
  defaultPort = 8788;
  sleepAfter = '1m';
  enableInternet = true;
  envVars = {
    STY_API_URL: this.env.STY_API_URL,
    STY_GIT_GATEWAY_TOKEN: this.env.STY_GIT_GATEWAY_TOKEN,
    STY_GIT_LISTEN: '0.0.0.0:8788',
    STY_GIT_ROOT: '/var/lib/sty/repositories',
    STY_GIT_LOCAL: '0'
  };
}

export class ValidatorContainer extends GitContainer { enableInternet = false; }
export class MaintenanceContainer extends GitContainer { enableInternet = false; }

export { ContainerProxy };

export default {
  async fetch(request: Request, env: GitEdgeEnv): Promise<Response> {
    try {
      const nativeRoute = nativePushRoute(request);
      if (nativeRoute) return handleNativePush(request, env, nativeRoute);
      const route = await repositoryRoute(request);
      if (!route) return new Response('Repository not found\n', { status: 404 });
      const container = getContainer(env.GIT_CONTAINERS, `${route.owner}/${route.repository}`);
      if (route.writes) return handleCompatibilityPush(request, container, env, route.owner, route.repository);
      await authorizeGit(request, env, route.owner, route.repository, 'git-upload-pack');
      await hydrateRepository(container, env, route.owner, route.repository);
      return container.fetch(request);
    } catch (error) {
      if (error instanceof AuthorizationError) {
        const response = new Response('Git access denied\n', { status: error.status });
        if (error.status === 401) response.headers.set('www-authenticate', 'Basic realm="Sty", charset="UTF-8"');
        return response;
      }
      console.error(error);
      return new Response('Git gateway failed\n', { status: 500 });
    }
  }
} satisfies ExportedHandler<GitEdgeEnv>;

async function repositoryRoute(request: Request): Promise<RepositoryRoute | null> {
  const url = new URL(request.url);
  if (url.pathname.startsWith('/_sty/')) {
    if (request.method !== 'POST' || !['/_sty/merge', '/_sty/compare', '/_sty/commit', '/_sty/blob'].includes(url.pathname)) return null;
    const body = await request.clone().json<Record<string, unknown>>().catch(() => null);
    if (!body || typeof body.owner !== 'string' || typeof body.repository !== 'string' || !safeSegment(body.owner) || !safeSegment(body.repository)) return null;
    return { owner: body.owner, repository: body.repository, writes: url.pathname === '/_sty/merge' };
  }
  const match = url.pathname.match(/^\/([^/]+)\/([^/]+)\.git\//);
  if (!match || !safeSegment(match[1]) || !safeSegment(match[2])) return null;
  const service = url.searchParams.get('service') ?? url.pathname.split('/').at(-1);
  return { owner: match[1], repository: match[2], writes: service === 'git-receive-pack' };
}

function safeSegment(value: string | undefined): value is string {
  return Boolean(value && value !== '.' && value !== '..' && /^[a-zA-Z0-9._-]+$/.test(value));
}
