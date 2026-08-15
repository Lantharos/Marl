import { getContainer } from '@cloudflare/containers';
import { DurableObject } from 'cloudflare:workers';
import { promoteCanonicalObject } from './canonical';
import type { GitEdgeEnv } from './env';
import { expectContainer, hydrateRepository, internalRequest } from './hydration';
import { acknowledgeCommittedPush, committedPush, publishWithReconciliation } from './reconciliation';
import { organizationQuota, repositoryState, type RepositorySnapshotResponse } from './state-client';
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
      await this.ctx.storage.put('task', { ...task, attempts });
      await this.ctx.storage.setAlarm(Date.now() + Math.min(5 * 60 * 1000 * 2 ** Math.min(attempts - 1, 4), 60 * 60 * 1000));
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
    const prior = await committedPush(repo, priorId);
    if (prior) {
      await organizationQuota(env, organizationId).request('/adjust', { id: priorId, deltaBytes: prior.accountingDelta });
      await acknowledgeCommittedPush(repo, priorId);
      await Promise.allSettled([
        env.REPOSITORIES.delete(`quarantine/${repository}/${priorId}/canonical.pack`),
        env.REPOSITORIES.delete(`quarantine/${repository}/${priorId}/canonical.idx`)
      ]);
      return;
    }
  }
  if (!force && current.state.packs.length < COMPACTION_THRESHOLD) return;
  const pushId = `compact_${current.state.generation}`;
  const expiresAt = Date.now() + 15 * 60 * 1000;
  const container = getContainer(env.MAINTENANCE_CONTAINERS, `${repository}:${current.state.generation}`);
  const base = `http://container/_sty/repositories/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/captures/${pushId}`;
  const createdKeys: string[] = [];
  let publicationStarted = false;
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
      const quarantinePrefix = `quarantine/${repository}/${pushId}/canonical`;
      const quarantinePackKey = `${quarantinePrefix}.pack`;
      const quarantineIndexKey = `${quarantinePrefix}.idx`;
      createdKeys.push(quarantinePackKey, quarantineIndexKey);
      await Promise.all([
        env.REPOSITORIES.put(quarantinePackKey, pack.body, { httpMetadata: { contentType: 'application/x-git-packed-objects' } }),
        env.REPOSITORIES.put(quarantineIndexKey, index.body, { httpMetadata: { contentType: 'application/x-git-packed-objects-toc' } })
      ]);
      const prefix = `repositories/${repository}/packs/${capture.packId}`;
      const packKey = `${prefix}.pack`;
      const indexKey = `${prefix}.idx`;
      if (await promoteCanonicalObject(env.REPOSITORIES, quarantinePackKey, packKey, capture.packBytes, 'application/x-git-packed-objects')) createdKeys.push(packKey);
      if (await promoteCanonicalObject(env.REPOSITORIES, quarantineIndexKey, indexKey, null, 'application/x-git-packed-objects-toc')) createdKeys.push(indexKey);
      packs.push({ id: capture.packId, packKey, indexKey, compressedBytes: capture.packBytes, expandedBytes: capture.expandedBytes, objectCount: capture.objectCount, largestBlobBytes: capture.largestBlobBytes });
    }
    const generation = current.state.generation + 1;
    const manifest = JSON.stringify({ generation, refsVersion: current.state.refsVersion, refs: current.state.refs, packs });
    const manifestHash = await sha256(manifest);
    const manifestKey = `repositories/${repository}/manifests/${generation}-${manifestHash}.json`;
    createdKeys.push(manifestKey);
    await env.REPOSITORIES.put(manifestKey, manifest, { httpMetadata: { contentType: 'application/json' } });
    publicationStarted = true;
    const resolution = await publishWithReconciliation({
      publish: async () => {
        const next = await repo.request<RepositorySnapshotResponse>('/publish', { pushId, expectedGeneration: current.state.generation, refs: current.state.refs, manifestKey, manifestHash, packs });
        return next.state.storedBytes - current.state.storedBytes;
      },
      readCommitted: () => committedPush(repo, pushId),
      recover: async (committed) => committed.accountingDelta,
      discard: async () => {
        await Promise.allSettled(createdKeys.map((key) => env.REPOSITORIES.delete(key)));
        await repo.request('/abort', { pushId }).catch(() => {});
      }
    });
    await organizationQuota(env, organizationId).request('/adjust', { id: pushId, deltaBytes: resolution.value });
    await acknowledgeCommittedPush(repo, pushId);
    await Promise.allSettled([
      env.REPOSITORIES.delete(`quarantine/${repository}/${pushId}/canonical.pack`),
      env.REPOSITORIES.delete(`quarantine/${repository}/${pushId}/canonical.idx`)
    ]);
  } catch (error) {
    if (!publicationStarted) {
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
