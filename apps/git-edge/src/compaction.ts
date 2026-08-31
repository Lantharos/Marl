import { getContainer } from '@cloudflare/containers';
import { DurableObject } from 'cloudflare:workers';
import { readBoundedJson } from './bounded-body';
import { promoteCanonicalObject } from './canonical';
import { beginOperation, completeOperation, operationResponse, readOperation, retryOperation, scheduleOperation } from './durable-operation';
import type { GitEdgeEnv } from './env';
import { expectContainer, hydrateRepository, internalRequest } from './hydration';
import { acknowledgeCommittedPush, committedPush, publishWithReconciliation } from './reconciliation';
import { organizationQuota, repositoryState, type RepositorySnapshotResponse } from './state-client';
import type { PackDescriptor } from './storage-model';
import { parseStateBody, stateFailure } from './state-http';
import { compactionTaskBody } from './state-schemas';

const COMPACTION_THRESHOLD = 12;
type CompactionTask = { owner: string; repository: string; repositoryId: string; organizationId: string; generation: number; force: boolean };

export class CompactionObject extends DurableObject<GitEdgeEnv> {
  async fetch(request: Request) {
    if (request.headers.get('x-marl-storage-token') !== this.env.MARL_GIT_GATEWAY_TOKEN) return new Response(null, { status: 404 });
    if (request.method === 'GET' && new URL(request.url).pathname === '/status') return operationResponse(await readOperation(this.ctx.storage));
    try {
      const task = await parseStateBody(request, compactionTaskBody);
      await scheduleOperation(this.ctx.storage, 'repository.compaction', String(task.generation), { ...task, force: task.force ?? false });
      return new Response(null, { status: 202 });
    } catch (error) {
      return stateFailure(error);
    }
  }

  async alarm() {
    const operation = await beginOperation<CompactionTask>(this.ctx.storage);
    if (!operation) return;
    const task = operation.payload;
    try {
      await maybeCompactRepository(this.env, task.owner, task.repository, task.repositoryId, task.organizationId, task.force);
      await completeOperation(this.ctx.storage, operation.id);
    } catch (error) {
      console.error('repository compaction failed', error);
      await retryOperation(this.ctx.storage, operation.id, error, Math.min(5 * 60 * 1000 * 2 ** Math.min(operation.attempts - 1, 4), 60 * 60 * 1000));
    }
  }
}

export async function scheduleCompaction(env: GitEdgeEnv, owner: string, repository: string, repositoryId: string, organizationId: string, generation: number, force = false) {
  const stub = env.COMPACTIONS.get(env.COMPACTIONS.idFromName(repositoryId));
  const response = await stub.fetch('http://compaction/schedule', {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-marl-storage-token': env.MARL_GIT_GATEWAY_TOKEN },
    body: JSON.stringify({ owner, repository, repositoryId, organizationId, generation, force })
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

export async function maybeCompactRepository(env: GitEdgeEnv, owner: string, name: string, repositoryId: string, organizationId: string, force = false) {
  const repository = repositoryId;
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
        env.REPOSITORIES.delete(`quarantine/${repository}/${priorId}/canonical.idx`),
        env.REPOSITORIES.delete(`quarantine/${repository}/${priorId}/canonical.objects.json`)
      ]);
      return;
    }
  }
  if (!force && current.state.packs.length < COMPACTION_THRESHOLD) return;
  const pushId = `compact_${current.state.generation}`;
  const expiresAt = Date.now() + 15 * 60 * 1000;
  const container = getContainer(env.MAINTENANCE_CONTAINERS, `${repository}:${current.state.generation}`);
  const base = `http://container/_marl/repositories/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/captures/${pushId}`;
  const createdKeys: string[] = [];
  let publicationStarted = false;
  try {
    await repo.request('/begin', { pushId, reservationId: pushId, expiresAt, expectedRefs: {}, proposedRefs: current.state.refs });
    await hydrateRepository(container, env, owner, name, repositoryId);
    const captureResponse = await expectContainer(container.fetch(internalRequest(base, env, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ knownRefs: {}, full: true })
    })));
    const capture = await readBoundedJson<Capture>(captureResponse, 16 * 1024 * 1024);
    if (!capture) throw new Error('Compaction returned invalid capture metadata.');
    if (!capture.hasPack && Object.keys(capture.refs).length) throw new Error('Compaction did not produce a canonical pack.');
    const packs: PackDescriptor[] = [];
    if (capture.hasPack && capture.packId) {
      const [pack, index, objects] = await Promise.all([
        expectContainer(container.fetch(internalRequest(`${base}/pack`, env))),
        expectContainer(container.fetch(internalRequest(`${base}/idx`, env))),
        expectContainer(container.fetch(internalRequest(`${base}/objects`, env)))
      ]);
      if (!pack.body || !index.body) throw new Error('Compaction returned an incomplete pack index.');
      const objectCatalog = await readBoundedJson<Array<{ id: string; kind: string; size: number; packedBytes: number; offset: number; references: string[] }>>(objects, 64 * 1024 * 1024);
      if (!Array.isArray(objectCatalog) || objectCatalog.length !== capture.objectCount) throw new Error('Compaction returned an invalid object catalog.');
      const objectMetadata = JSON.stringify(objectCatalog);
      const quarantinePrefix = `quarantine/${repository}/${pushId}/canonical`;
      const quarantinePackKey = `${quarantinePrefix}.pack`;
      const quarantineIndexKey = `${quarantinePrefix}.idx`;
      const quarantineObjectIndexKey = `${quarantinePrefix}.objects.json`;
      createdKeys.push(quarantinePackKey, quarantineIndexKey, quarantineObjectIndexKey);
      await Promise.all([
        env.REPOSITORIES.put(quarantinePackKey, pack.body, { httpMetadata: { contentType: 'application/x-git-packed-objects' } }),
        env.REPOSITORIES.put(quarantineIndexKey, index.body, { httpMetadata: { contentType: 'application/x-git-packed-objects-toc' } }),
        env.REPOSITORIES.put(quarantineObjectIndexKey, objectMetadata, { httpMetadata: { contentType: 'application/json' } })
      ]);
      const prefix = `repositories/${repository}/packs/${capture.packId}`;
      const packKey = `${prefix}.pack`;
      const indexKey = `${prefix}.idx`;
      const objectIndexKey = `${prefix}.objects.json`;
      if (await promoteCanonicalObject(env.REPOSITORIES, quarantinePackKey, packKey, capture.packBytes, 'application/x-git-packed-objects')) createdKeys.push(packKey);
      if (await promoteCanonicalObject(env.REPOSITORIES, quarantineIndexKey, indexKey, null, 'application/x-git-packed-objects-toc')) createdKeys.push(indexKey);
      if (await promoteCanonicalObject(env.REPOSITORIES, quarantineObjectIndexKey, objectIndexKey, null, 'application/json')) createdKeys.push(objectIndexKey);
      packs.push({ id: capture.packId, packKey, indexKey, objectIndexKey, compressedBytes: capture.packBytes, expandedBytes: capture.expandedBytes, objectCount: capture.objectCount, largestBlobBytes: capture.largestBlobBytes });
      for (let offset = 0; offset < objectCatalog.length; offset += 500) await repo.request('/catalog', { packId: capture.packId, objects: objectCatalog.slice(offset, offset + 500) });
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
      env.REPOSITORIES.delete(`quarantine/${repository}/${pushId}/canonical.idx`),
      env.REPOSITORIES.delete(`quarantine/${repository}/${pushId}/canonical.objects.json`)
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
