import { getContainer } from '@cloudflare/containers';
import type { GitEdgeEnv } from './env';
import { organizationQuota, repositoryState, uploadSession, type RepositorySnapshotResponse, type UploadSnapshotResponse } from './state-client';
import { STORAGE_LIMITS, type PackDescriptor } from './storage-model';

type PackReport = { id: string; compressedBytes: number; expandedBytes: number; objectCount: number; largestBlobBytes: number };

export async function finalizeUploadedPush(env: GitEdgeEnv, repository: string, organizationId: string, session: UploadSnapshotResponse['session']) {
  const uploads = uploadSession(env, session.pushId);
  const repo = repositoryState(env, repository);
  const quota = organizationQuota(env, organizationId);
  const createdKeys = new Set(session.packs.map((pack) => pack.key));
  let manifestKey: string | null = null;
  try {
    const current = await repo.request<RepositorySnapshotResponse>('/snapshot');
    if (current.state.packs.length + session.packs.length > STORAGE_LIMITS.packsPerGeneration) throw new Error('This repository needs compaction before another pack can be published.');
    const newPacks = await validatePacks(env, session, current.state.packs);
    newPacks.forEach((pack) => createdKeys.add(pack.indexKey));
    const packs = [...current.state.packs, ...newPacks];
    const generation = current.state.generation + 1;
    const manifest = JSON.stringify({ generation, refsVersion: current.state.refsVersion + 1, refs: session.refs, packs });
    const manifestHash = await sha256(manifest);
    manifestKey = `repositories/${repository}/manifests/${generation}-${manifestHash}.json`;
    await uploads.request('/track', { key: manifestKey });
    await env.REPOSITORIES.put(manifestKey, manifest, { httpMetadata: { contentType: 'application/json' } });
    const published = await repo.request<RepositorySnapshotResponse>('/publish', { pushId: session.pushId, expectedGeneration: session.expectedGeneration, refs: session.refs, manifestKey, manifestHash, packs });
    const actualBytes = newPacks.reduce((total, pack) => total + pack.compressedBytes, 0);
    await uploads.request('/published', {}).catch((error) => console.error('upload publication reconciliation deferred', error));
    await quota.request('/settle', { id: session.pushId, actualBytes }).catch((error) => console.error('quota settlement deferred', error));
    return published.state;
  } catch (error) {
    await Promise.allSettled(session.packs.flatMap((pack) => pack.multipartUploadId ? [env.REPOSITORIES.resumeMultipartUpload(pack.key, pack.multipartUploadId).abort()] : []));
    await Promise.allSettled([...createdKeys].map((key) => env.REPOSITORIES.delete(key)));
    if (manifestKey) await env.REPOSITORIES.delete(manifestKey).catch(() => {});
    await Promise.allSettled([repo.request('/abort', { pushId: session.pushId }), quota.request('/release', { id: session.pushId }), uploads.request('/aborted', {})]);
    throw error;
  }
}

async function validatePacks(env: GitEdgeEnv, session: UploadSnapshotResponse['session'], knownPacks: PackDescriptor[]) {
  const container = getContainer(env.VALIDATOR_CONTAINERS, session.pushId);
  const indexKeys: string[] = [];
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
      const key = `repositories/${session.repository}/packs/${session.pushId}-${number}.idx`;
      await uploadSession(env, session.pushId).request('/track', { key });
      await env.REPOSITORIES.put(key, storageBody, { httpMetadata: { contentType: 'application/x-git-packed-objects-toc' } });
      indexKeys.push(key);
      await expectContainer(container.fetch(internalRequest(`http://container/_sty/packs/${session.pushId}/known/${report.id}`, env, { method: 'PUT', body: knownBody })));
    }
    for (let number = 0; number < reports.length; number += 1) {
      await expectContainer(container.fetch(internalRequest(`http://container/_sty/packs/${session.pushId}/${number}/graph`, env, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ refs: session.refs }) })));
    }
    await expectContainer(container.fetch(internalRequest(`http://container/_sty/packs/${session.pushId}/refs`, env, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ refs: session.refs }) })));
    return reports.map((report, number): PackDescriptor => ({ ...report, packKey: session.packs[number].key, indexKey: indexKeys[number] }));
  } catch (error) {
    await Promise.allSettled(indexKeys.map((key) => env.REPOSITORIES.delete(key)));
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
