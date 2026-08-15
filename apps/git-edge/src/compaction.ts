import { getContainer } from '@cloudflare/containers';
import { DurableObject } from 'cloudflare:workers';
import type { GitEdgeEnv } from './env';
import { expectContainer, hydrateRepository, internalRequest } from './hydration';
import { StateRequestError, organizationQuota, repositoryState, type RepositorySnapshotResponse } from './state-client';
import type { PackDescriptor } from './storage-model';

const COMPACTION_THRESHOLD = 12;
type CompactionTask = { owner: string; repository: string; organizationId: string; force: boolean; attempts: number };

export class CompactionObject extends DurableObject<GitEdgeEnv> {
  async fetch(request: Request) {
    if (request.headers.get('x-sty-storage-token') !== this.env.STY_GIT_GATEWAY_TOKEN) return new Response(null, { status: 404 });
    const task = await request.json<Omit<CompactionTask, 'attempts'>>();
    await this.ctx.storage.put('task', { ...task, attempts: 0 });
    await this.ctx.storage.setAlarm(Date.now());
    return new Response(null, { status: 202 });
  }

  async alarm() {
    const task = await this.ctx.storage.get<CompactionTask>('task');
    if (!task) return;
    try {
      await maybeCompactRepository(this.env, task.owner, task.repository, task.organizationId, task.force);
      await this.ctx.storage.delete('task');
    } catch (error) {
      const attempts = task.attempts + 1;
      console.error('repository compaction failed', error);
      if (attempts >= 3) {
        await this.ctx.storage.delete('task');
      } else {
        await this.ctx.storage.put('task', { ...task, attempts });
        await this.ctx.storage.setAlarm(Date.now() + 5 * 60 * 1000);
      }
    }
  }
}

export async function scheduleCompaction(env: GitEdgeEnv, owner: string, repository: string, organizationId: string, force = false) {
  const name = `${owner}/${repository}`;
  const stub = env.COMPACTIONS.get(env.COMPACTIONS.idFromName(name));
  const response = await stub.fetch('http://compaction/schedule', {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-sty-storage-token': env.STY_GIT_GATEWAY_TOKEN },
    body: JSON.stringify({ owner, repository, organizationId, force })
  });
  if (!response.ok) throw new Error(`Compaction scheduling failed with ${response.status}.`);
}

type Capture = {
  refs: Record<string, string>;
  packBytes: number;
  hasPack: boolean;
  packId: string | null;
  expandedBytes: number;
  objectCount: number;
  largestBlobBytes: number;
};

export async function maybeCompactRepository(env: GitEdgeEnv, owner: string, name: string, organizationId: string, force = false) {
  const repository = `${owner}/${name}`;
  const repo = repositoryState(env, repository);
  const current = await repo.request<RepositorySnapshotResponse>('/snapshot');
  if (current.state.generation > 0) {
    const priorId = `compact_${current.state.generation - 1}`;
    const prior = await repo.request<{ committed: { accountingDelta: number } }>('/committed', { pushId: priorId }).catch((error) => {
      if (error instanceof StateRequestError && error.status === 404) return null;
      throw error;
    });
    if (prior) await organizationQuota(env, organizationId).request('/adjust', { id: priorId, deltaBytes: prior.committed.accountingDelta });
  }
  if (!force && current.state.packs.length < COMPACTION_THRESHOLD) return;
  const pushId = `compact_${current.state.generation}`;
  const expiresAt = Date.now() + 15 * 60 * 1000;
  const container = getContainer(env.MAINTENANCE_CONTAINERS, `${repository}:${current.state.generation}`);
  const base = `http://container/_sty/repositories/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/captures/${pushId}`;
  const createdKeys: string[] = [];
  let published = false;
  try {
    await repo.request('/begin', { pushId, reservationId: pushId, expiresAt, expectedRefs: {}, proposedRefs: current.state.refs });
    await hydrateRepository(container, env, owner, name);
    const capture = await expectContainer(container.fetch(internalRequest(base, env, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ knownRefs: {}, full: true })
    }))).then((response) => response.json<Capture>());
    if (!capture.hasPack && Object.keys(capture.refs).length) throw new Error('Compaction did not produce a canonical pack.');
    const packs: PackDescriptor[] = [];
    if (capture.hasPack && capture.packId) {
      const [pack, index] = await Promise.all([
        expectContainer(container.fetch(internalRequest(`${base}/pack`, env))),
        expectContainer(container.fetch(internalRequest(`${base}/idx`, env)))
      ]);
      if (!pack.body || !index.body) throw new Error('Compaction returned an incomplete pack.');
      const prefix = `repositories/${repository}/packs/${pushId}`;
      const packKey = `${prefix}.pack`;
      const indexKey = `${prefix}.idx`;
      createdKeys.push(packKey, indexKey);
      await Promise.all([
        env.REPOSITORIES.put(packKey, pack.body, { httpMetadata: { contentType: 'application/x-git-packed-objects' } }),
        env.REPOSITORIES.put(indexKey, index.body, { httpMetadata: { contentType: 'application/x-git-packed-objects-toc' } })
      ]);
      packs.push({ id: capture.packId, packKey, indexKey, compressedBytes: capture.packBytes, expandedBytes: capture.expandedBytes, objectCount: capture.objectCount, largestBlobBytes: capture.largestBlobBytes });
    }
    const generation = current.state.generation + 1;
    const manifest = JSON.stringify({ generation, refsVersion: current.state.refsVersion, refs: current.state.refs, packs });
    const manifestHash = await sha256(manifest);
    const manifestKey = `repositories/${repository}/manifests/${generation}-${manifestHash}.json`;
    createdKeys.push(manifestKey);
    await env.REPOSITORIES.put(manifestKey, manifest, { httpMetadata: { contentType: 'application/json' } });
    const next = await repo.request<RepositorySnapshotResponse>('/publish', { pushId, expectedGeneration: current.state.generation, refs: current.state.refs, manifestKey, manifestHash, packs });
    published = true;
    const deltaBytes = next.state.storedBytes - current.state.storedBytes;
    await organizationQuota(env, organizationId).request('/adjust', { id: pushId, deltaBytes }).catch((error) => console.error('compaction accounting deferred', error));
  } catch (error) {
    if (!published) {
      await Promise.allSettled(createdKeys.map((key) => env.REPOSITORIES.delete(key)));
      await repo.request('/abort', { pushId }).catch(() => {});
    }
    throw error;
  } finally {
    await container.fetch(internalRequest(base, env, { method: 'DELETE' })).catch(() => {});
    await container.stop().catch(() => {});
  }
}

async function sha256(value: string) {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}
