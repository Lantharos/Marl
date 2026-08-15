import { Container, ContainerProxy, getContainer } from '@cloudflare/containers';

interface Env {
  GIT_CONTAINERS: DurableObjectNamespace<GitContainer>;
  REPOSITORIES: R2Bucket;
  STY_API_URL: string;
  STY_GIT_GATEWAY_TOKEN: string;
}

type RepositoryRoute = { owner: string; repository: string; writes: boolean };

export class GitContainer extends Container<Env> {
  defaultPort = 8788;
  sleepAfter = '30m';
  enableInternet = true;
  envVars = {
    STY_API_URL: this.env.STY_API_URL,
    STY_GIT_GATEWAY_TOKEN: this.env.STY_GIT_GATEWAY_TOKEN,
    STY_GIT_LISTEN: '0.0.0.0:8788',
    STY_GIT_ROOT: '/var/lib/sty/repositories'
  };
}

export { ContainerProxy };

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/_sty/snapshot/')) return new Response('Not found\n', { status: 404 });
    const route = await repositoryRoute(request);
    if (!route) return new Response('Repository not found\n', { status: 404 });
    const container = getContainer(env.GIT_CONTAINERS, `${route.owner}/${route.repository}`);
    await restore(container, env, route);
    const response = await container.fetch(request);
    if (!route.writes) return response;
    const body = await response.arrayBuffer();
    if (response.ok) await snapshot(container, env, route);
    return new Response(body, response);
  }
} satisfies ExportedHandler<Env>;

async function repositoryRoute(request: Request): Promise<RepositoryRoute | null> {
  const url = new URL(request.url);
  if (url.pathname.startsWith('/_sty/')) {
    if (request.method !== 'POST' || !['/_sty/merge', '/_sty/compare', '/_sty/commit'].includes(url.pathname)) return null;
    const body = await request.clone().json<Record<string, unknown>>().catch(() => null);
    if (!body || typeof body.owner !== 'string' || typeof body.repository !== 'string' || !safeSegment(body.owner) || !safeSegment(body.repository)) return null;
    return { owner: body.owner, repository: body.repository, writes: url.pathname === '/_sty/merge' };
  }
  const match = url.pathname.match(/^\/([^/]+)\/([^/]+)\.git\//);
  if (!match || !safeSegment(match[1]) || !safeSegment(match[2])) return null;
  const service = url.searchParams.get('service') ?? url.pathname.split('/').at(-1);
  return { owner: match[1], repository: match[2], writes: service === 'git-receive-pack' };
}

async function restore(container: DurableObjectStub<GitContainer>, env: Env, route: RepositoryRoute) {
  const path = `${encodeURIComponent(route.owner)}/${encodeURIComponent(route.repository)}`;
  const status = await container.fetch(internalRequest(`http://container/_sty/snapshot/status/${path}`, env));
  if (status.status !== 404) {
    if (!status.ok) throw new Error(`Repository status failed with ${status.status}.`);
    return;
  }
  const object = await env.REPOSITORIES.get(snapshotKey(route));
  if (!object) return;
  const response = await container.fetch(internalRequest(`http://container/_sty/snapshot/restore/${path}`, env, { method: 'PUT', body: object.body }));
  if (!response.ok) throw new Error(`Repository restore failed with ${response.status}.`);
}

async function snapshot(container: DurableObjectStub<GitContainer>, env: Env, route: RepositoryRoute) {
  const path = `${encodeURIComponent(route.owner)}/${encodeURIComponent(route.repository)}`;
  const response = await container.fetch(internalRequest(`http://container/_sty/snapshot/export/${path}`, env));
  if (!response.ok || !response.body) throw new Error(`Repository snapshot failed with ${response.status}.`);
  await env.REPOSITORIES.put(snapshotKey(route), response.body, { httpMetadata: { contentType: 'application/zstd' }, customMetadata: { owner: route.owner, repository: route.repository } });
}

function internalRequest(url: string, env: Env, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  headers.set('x-sty-snapshot-token', env.STY_GIT_GATEWAY_TOKEN);
  return new Request(url, { ...init, headers });
}

function snapshotKey(route: RepositoryRoute) {
  return `repositories/${encodeURIComponent(route.owner)}/${encodeURIComponent(route.repository)}.tar.zst`;
}

function safeSegment(value: string | undefined): value is string {
  return Boolean(value && value !== '.' && value !== '..' && /^[a-zA-Z0-9._-]+$/.test(value));
}
