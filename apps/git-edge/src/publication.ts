import { getContainer } from '@cloudflare/containers';
import { promoteCanonicalObject } from './canonical';
import type { GitEdgeEnv } from './env';
import { acknowledgeCommittedPush, committedPush, publishWithReconciliation, recoverCommittedState } from './reconciliation';
import { organizationQuota, repositoryState, uploadSession, type RepositorySnapshotResponse, type UploadSnapshotResponse } from './state-client';
import { STORAGE_LIMITS, type PackDescriptor } from './storage-model';

type PackReport = { id: string; compressedBytes: number; expandedBytes: number; objectCount: number; largestBlobBytes: number };
type PackObject = { id: string; kind: string; size: number; packedBytes: number; offset: number; references: string[] };

export async function finalizeUploadedPush(env: GitEdgeEnv, repository: string, organizationId: string, session: UploadSnapshotResponse['session']) {
  const uploads = uploadSession(env, session.pushId);
  const repo = repositoryState(env, repository);
  const quota = organizationQuota(env, organizationId);
  const createdKeys = new Set(session.packs.map((pack) => pack.key));
  let manifestKey: string | null = null;
  let packs: PackDescriptor[] = [];
  let manifestHash = '';
  let generation = 0;
  let actualBytes = 0;
  try {
    const current = await repo.request<RepositorySnapshotResponse>('/snapshot');
    if (current.state.packs.length + session.packs.length > STORAGE_LIMITS.packsPerGeneration) throw new Error('This repository needs compaction before another pack can be published.');
    const validated = await validatePacks(env, session, current.state.packs);
    const newPacks = validated.packs;
    for (const catalog of validated.catalogs) {
      for (let offset = 0; offset < catalog.objects.length; offset += 500) await repo.request('/catalog', { packId: catalog.packId, objects: catalog.objects.slice(offset, offset + 500) });
    }
    validated.createdCanonicalKeys.forEach((key) => createdKeys.add(key));
    packs = [...current.state.packs, ...newPacks];
    generation = current.state.generation + 1;
    const refsVersion = refsEqual(current.state.refs, session.refs) ? current.state.refsVersion : current.state.refsVersion + 1;
    const manifest = JSON.stringify({ generation, refsVersion, refs: session.refs, packs });
    manifestHash = await sha256(manifest);
    manifestKey = `repositories/${repository}/manifests/${generation}-${manifestHash}.json`;
    await uploads.request('/track', { key: manifestKey });
    await env.REPOSITORIES.put(manifestKey, manifest, { httpMetadata: { contentType: 'application/json' } });
    actualBytes = newPacks.reduce((total, pack) => total + pack.compressedBytes, 0);
  } catch (error) {
    await discardUnpublishedPush(env, session, createdKeys, manifestKey, repo, quota, uploads);
    throw error;
  }

  const resolution = await publishWithReconciliation({
    publish: async () => (await repo.request<RepositorySnapshotResponse>('/publish', { pushId: session.pushId, expectedGeneration: session.expectedGeneration, refs: session.refs, manifestKey, manifestHash, packs })).state,
    readCommitted: () => committedPush(repo, session.pushId),
    recover: (committed) => recoverCommittedState(repo, committed),
    discard: () => discardUnpublishedPush(env, session, createdKeys, manifestKey, repo, quota, uploads)
  });
  const published = resolution.value;
  if (resolution.recovered) actualBytes = resolution.recovered.actualBytes;
  await reconcilePublishedPush(repo, quota, uploads, session.pushId, actualBytes);
  await Promise.allSettled([...session.packs.map((pack) => pack.key), ...session.cleanupKeys.filter((key) => key.startsWith('quarantine/'))].map((key) => env.REPOSITORIES.delete(key)));
  return published;
}

async function reconcilePublishedPush(
  repository: ReturnType<typeof repositoryState>,
  quota: ReturnType<typeof organizationQuota>,
  uploads: ReturnType<typeof uploadSession>,
  pushId: string,
  actualBytes: number
) {
  try {
    await quota.request('/settle', { id: pushId, actualBytes });
  } catch (error) {
    console.error('quota settlement deferred', error);
    return;
  }
  try {
    await uploads.request('/published', {});
  } catch (error) {
    console.error('upload publication reconciliation deferred', error);
    return;
  }
  await acknowledgeCommittedPush(repository, pushId).catch((error) => console.error('publication acknowledgement deferred', error));
}

async function discardUnpublishedPush(
  env: GitEdgeEnv,
  session: UploadSnapshotResponse['session'],
  createdKeys: Set<string>,
  manifestKey: string | null,
  repository: ReturnType<typeof repositoryState>,
  quota: ReturnType<typeof organizationQuota>,
  uploads: ReturnType<typeof uploadSession>
) {
  await Promise.allSettled(session.packs.flatMap((pack) => pack.multipartUploadId ? [env.REPOSITORIES.resumeMultipartUpload(pack.key, pack.multipartUploadId).abort()] : []));
  await Promise.allSettled([...createdKeys, ...session.cleanupKeys].map((key) => env.REPOSITORIES.delete(key)));
  if (manifestKey) await env.REPOSITORIES.delete(manifestKey).catch(() => {});
  await Promise.allSettled([repository.request('/abort', { pushId: session.pushId }), quota.request('/release', { id: session.pushId }), uploads.request('/aborted', {})]);
}

async function validatePacks(env: GitEdgeEnv, session: UploadSnapshotResponse['session'], knownPacks: PackDescriptor[]) {
  const container = getContainer(env.VALIDATOR_CONTAINERS, session.pushId);
  const indexKeys: string[] = [];
  const createdCanonicalKeys: string[] = [];
  const catalogs: Array<{ packId: string; objects: PackObject[] }> = [];
  try {
    for (const known of knownPacks) {
      const index = await env.REPOSITORIES.get(known.indexKey);
      if (!index) throw new Error(`Active pack index ${known.id} is missing.`);
      await expectContainer(container.fetch(internalRequest(`http://container/_sty/packs/${session.pushId}/known/${known.id}`, env, { method: 'PUT', body: index.body })));
    }
    const reports: PackReport[] = [];
    for (const pack of session.packs) {
      const object = await env.REPOSITORIES.get(pack.key);
      if (!object) throw new Error(`Uploaded pack ${pack.number} is missing.`);
      const response = await expectContainer(container.fetch(internalRequest(`http://container/_sty/packs/${session.pushId}/${pack.number}`, env, { method: 'PUT', body: object.body })));
      reports.push(await response.json<PackReport>());
    }
    for (const [number, report] of reports.entries()) {
      if (report.compressedBytes !== session.packs[number].bytes) throw new Error(`Pack ${number} does not match its declared size.`);
      const response = await expectContainer(container.fetch(internalRequest(`http://container/_sty/packs/${session.pushId}/${number}/index`, env)));
      if (!response.body) throw new Error('Validator returned an empty Git index.');
      const [storageBody, knownBody] = response.body.tee();
      const key = `quarantine/${session.repository}/${session.pushId}/${number}.idx`;
      await uploadSession(env, session.pushId).request('/track', { key });
      await env.REPOSITORIES.put(key, storageBody, { httpMetadata: { contentType: 'application/x-git-packed-objects-toc' } });
      indexKeys.push(key);
      await expectContainer(container.fetch(internalRequest(`http://container/_sty/packs/${session.pushId}/known/${report.id}`, env, { method: 'PUT', body: knownBody })));
    }
    for (let number = 0; number < reports.length; number += 1) {
      await expectContainer(container.fetch(internalRequest(`http://container/_sty/packs/${session.pushId}/${number}/graph`, env, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ refs: session.refs }) })));
    }
    await expectContainer(container.fetch(internalRequest(`http://container/_sty/packs/${session.pushId}/refs`, env, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ refs: session.refs }) })));
    const packs: PackDescriptor[] = [];
    for (const [number, report] of reports.entries()) {
      const metadataResponse = await expectContainer(container.fetch(internalRequest(`http://container/_sty/packs/${session.pushId}/${number}/objects`, env)));
      const objects = await metadataResponse.json<PackObject[]>();
      if (!Array.isArray(objects) || objects.length !== report.objectCount) throw new Error('Validator returned an invalid object index.');
      const metadata = JSON.stringify(objects);
      const metadataKey = `quarantine/${session.repository}/${session.pushId}/${number}.objects.json`;
      await uploadSession(env, session.pushId).request('/track', { key: metadataKey });
      await env.REPOSITORIES.put(metadataKey, metadata, { httpMetadata: { contentType: 'application/json' } });
      const prefix = `repositories/${session.repository}/packs/${report.id}`;
      const packKey = `${prefix}.pack`;
      const indexKey = `${prefix}.idx`;
      const objectIndexKey = `${prefix}.objects.json`;
      if (await promoteCanonicalObject(env.REPOSITORIES, session.packs[number].key, packKey, report.compressedBytes, 'application/x-git-packed-objects')) createdCanonicalKeys.push(packKey);
      if (await promoteCanonicalObject(env.REPOSITORIES, indexKeys[number], indexKey, null, 'application/x-git-packed-objects-toc')) createdCanonicalKeys.push(indexKey);
      if (await promoteCanonicalObject(env.REPOSITORIES, metadataKey, objectIndexKey, null, 'application/json')) createdCanonicalKeys.push(objectIndexKey);
      packs.push({ ...report, packKey, indexKey, objectIndexKey });
      catalogs.push({ packId: report.id, objects });
    }
    return { packs, catalogs, createdCanonicalKeys };
  } catch (error) {
    await Promise.allSettled([...indexKeys, ...createdCanonicalKeys].map((key) => env.REPOSITORIES.delete(key)));
    throw error;
  } finally {
    await container.fetch(internalRequest(`http://container/_sty/packs/${session.pushId}`, env, { method: 'DELETE' })).catch(() => {});
    await container.stop().catch(() => {});
  }
}

function internalRequest(url: string, env: GitEdgeEnv, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  headers.set('x-sty-storage-token', env.STY_GIT_GATEWAY_TOKEN);
  return new Request(url, { ...init, headers });
}

async function expectContainer(promise: Promise<Response>) {
  const response = await promise;
  if (!response.ok) throw new Error((await response.text()) || `Validator failed with ${response.status}.`);
  return response;
}

async function sha256(value: string) {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function refsEqual(left: Record<string, string>, right: Record<string, string>) {
  const entries = Object.entries(left);
  return entries.length === Object.keys(right).length && entries.every(([name, objectId]) => right[name] === objectId);
}
