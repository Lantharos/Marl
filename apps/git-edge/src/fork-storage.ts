import type { GitEdgeEnv } from './env';
import { scheduleRepositoryIndex } from './indexing';
import { organizationQuota, repositoryState, type RepositorySnapshotResponse } from './state-client';
import type { PackDescriptor } from './storage-model';

type ForkRequest = {
  repositoryId: string;
  sourceRepositoryId: string;
  sourceOwner: string;
  sourceRepository: string;
  destinationOrganizationId: string;
  destinationOwner: string;
  destinationRepository: string;
  actorId: string;
};

export async function forkRepositoryStorage(request: Request, env: GitEdgeEnv) {
  if (request.headers.get('x-marl-gateway-token') !== env.MARL_GIT_GATEWAY_TOKEN) return new Response(null, { status: 404 });
  const body = await request.json<ForkRequest>().catch(() => null);
  if (!body || !valid(body)) return Response.json({ error: 'invalid_fork' }, { status: 422 });
  const source = await repositoryState(env, body.sourceRepositoryId).request<RepositorySnapshotResponse>('/snapshot');
  if (source.state.generation === 0) return new Response(null, { status: 201 });
  const destination = repositoryState(env, body.repositoryId);
  const existing = await destination.request<RepositorySnapshotResponse>('/snapshot');
  if (existing.state.generation !== 0) return Response.json({ error: 'fork_exists' }, { status: 409 });
  const keys: string[] = [];
  let adjusted = false;
  try {
    const packs: PackDescriptor[] = [];
    const catalogs: Array<{ packId: string; objects: unknown[] }> = [];
    for (const pack of source.state.packs) {
      const prefix = `repositories/${body.repositoryId}/packs/${pack.id}`;
      const copied = { ...pack, packKey: `${prefix}.pack`, indexKey: `${prefix}.idx`, objectIndexKey: `${prefix}.objects.json` };
      await Promise.all([
        copy(env.REPOSITORIES, pack.packKey, copied.packKey, 'application/x-git-packed-objects'),
        copy(env.REPOSITORIES, pack.indexKey, copied.indexKey, 'application/x-git-packed-objects-toc'),
        copy(env.REPOSITORIES, pack.objectIndexKey, copied.objectIndexKey, 'application/json')
      ]);
      keys.push(copied.packKey, copied.indexKey, copied.objectIndexKey);
      const catalogObject = await env.REPOSITORIES.get(copied.objectIndexKey);
      const objects = catalogObject ? await catalogObject.json<unknown[]>() : null;
      if (!Array.isArray(objects)) throw new Error('Fork object catalog is missing.');
      catalogs.push({ packId: pack.id, objects });
      packs.push(copied);
    }
    const generation = 1;
    const refsVersion = Object.keys(source.state.refs).length ? 1 : 0;
    const manifest = JSON.stringify({ generation, refsVersion, refs: source.state.refs, packs });
    const manifestHash = await sha256(manifest);
    const manifestKey = `repositories/${body.repositoryId}/manifests/${generation}-${manifestHash}.json`;
    await env.REPOSITORIES.put(manifestKey, manifest, { httpMetadata: { contentType: 'application/json' } });
    keys.push(manifestKey);
    const quota = organizationQuota(env, body.destinationOrganizationId);
    await quota.request('/adjust', { id: `fork_${body.repositoryId}_create`, deltaBytes: source.state.storedBytes });
    adjusted = true;
    for (const catalog of catalogs) for (let offset = 0; offset < catalog.objects.length; offset += 500) await destination.request('/catalog', { packId: catalog.packId, objects: catalog.objects.slice(offset, offset + 500) });
    await destination.request('/fork', { refs: source.state.refs, manifestKey, manifestHash, packs });
    await scheduleRepositoryIndex(env, body.destinationOwner, body.destinationRepository, body.repositoryId, generation, body.actorId).catch((error) => console.error('fork indexing scheduling deferred', error));
    return new Response(null, { status: 201 });
  } catch (error) {
    await Promise.allSettled(keys.map((key) => env.REPOSITORIES.delete(key)));
    if (adjusted) await organizationQuota(env, body.destinationOrganizationId).request('/adjust', { id: `fork_${body.repositoryId}_rollback`, deltaBytes: -source.state.storedBytes }).catch(() => {});
    console.error(error);
    return Response.json({ error: 'fork_failed' }, { status: 502 });
  }
}

async function copy(bucket: R2Bucket, source: string, destination: string, contentType: string) {
  const object = await bucket.get(source);
  if (!object) throw new Error(`Fork source object ${source} is missing.`);
  await bucket.put(destination, object.body, { httpMetadata: { contentType } });
}

function valid(body: ForkRequest) {
  return [body.repositoryId, body.sourceRepositoryId, body.destinationOrganizationId, body.actorId].every((value) => typeof value === 'string' && value.length > 0) && [body.sourceOwner, body.sourceRepository, body.destinationOwner, body.destinationRepository].every((value) => /^[a-zA-Z0-9._-]+$/.test(value));
}

async function sha256(value: string) {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}
