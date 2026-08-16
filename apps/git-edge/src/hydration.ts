import type { Container } from '@cloudflare/containers';
import type { GitEdgeEnv } from './env';
import { repositoryState, type RepositorySnapshotResponse } from './state-client';

export type ContainerStub = DurableObjectStub<Container<GitEdgeEnv>>;
type ContainerStatus = { generation: number | null; cachedPacks: string[] };

export async function hydrateRepository(container: ContainerStub, env: GitEdgeEnv, owner: string, repository: string, storageKey: string) {
  const snapshot = await repositoryState(env, storageKey).request<RepositorySnapshotResponse>('/snapshot');
  const base = `http://container/_sty/repositories/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}`;
  const status = await expectContainer(container.fetch(internalRequest(`${base}/status`, env))).then((response) => response.json<ContainerStatus>());
  if (status.generation === snapshot.state.generation) return snapshot.state;
  const cached = new Set(status.cachedPacks);
  const missing = snapshot.state.packs.filter((pack) => !cached.has(pack.id));
  for (let offset = 0; offset < missing.length; offset += 4) {
    await Promise.all(missing.slice(offset, offset + 4).map(async (pack) => {
      const [packObject, indexObject] = await Promise.all([env.REPOSITORIES.get(pack.packKey), env.REPOSITORIES.get(pack.indexKey)]);
      if (!packObject || !indexObject) throw new Error(`Canonical pack ${pack.id} is incomplete.`);
      await Promise.all([
        expectContainer(container.fetch(internalRequest(`${base}/packs/${pack.id}/pack`, env, { method: 'PUT', body: packObject.body }))),
        expectContainer(container.fetch(internalRequest(`${base}/packs/${pack.id}/idx`, env, { method: 'PUT', body: indexObject.body })))
      ]);
    }));
  }
  await expectContainer(container.fetch(internalRequest(`${base}/activate`, env, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ generation: snapshot.state.generation, refs: snapshot.state.refs, packs: snapshot.state.packs.map((pack) => pack.id) })
  })));
  return snapshot.state;
}

export async function indexHydratedRepository(container: ContainerStub, env: GitEdgeEnv, repositoryId: string, owner: string, repository: string) {
  await expectContainer(container.fetch(internalRequest('http://container/_sty/index', env, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ repositoryId, owner, repository })
  })));
}

export function internalRequest(url: string, env: GitEdgeEnv, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  headers.set('x-sty-storage-token', env.STY_GIT_GATEWAY_TOKEN);
  return new Request(url, { ...init, headers });
}

export async function expectContainer(promise: Promise<Response>) {
  const response = await promise;
  if (!response.ok) throw new Error((await response.text()) || `Git container failed with ${response.status}.`);
  return response;
}
