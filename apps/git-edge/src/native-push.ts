import { authorizeGit, AuthorizationError } from './authorization';
import { scheduleCompaction } from './compaction';
import type { GitEdgeEnv } from './env';
import { scheduleRepositoryIndex } from './indexing';
import { finalizeUploadedPush } from './publication';
import { StateRequestError, organizationQuota, repositoryState, uploadSession, type RepositorySnapshotResponse, type UploadSnapshotResponse } from './state-client';
import { STORAGE_LIMITS } from './storage-model';

type PushRoute = { owner: string; repository: string; pushId?: string; pack?: number; part?: number; generation?: number; packId?: string; kind?: 'pack' | 'idx'; action: 'create' | 'part' | 'complete' | 'snapshot' | 'download' };
type PackPlan = { bytes: number; parts: number; key: string };
type ReadyPack = PackPlan & { number: number; multipartUploadId: string; uploadedParts: R2UploadedPart[] };

export function nativePushRoute(request: Request): PushRoute | null {
  const path = new URL(request.url).pathname;
  const create = path.match(/^\/v1\/repositories\/([^/]+)\/([^/]+)\/pushes$/);
  if (create && request.method === 'POST') return route(create[1], create[2], { action: 'create' });
  const snapshot = path.match(/^\/v1\/repositories\/([^/]+)\/([^/]+)\/storage$/);
  if (snapshot && request.method === 'GET') return route(snapshot[1], snapshot[2], { action: 'snapshot' });
  const part = path.match(/^\/v1\/repositories\/([^/]+)\/([^/]+)\/pushes\/(push_[a-z0-9]+)\/packs\/(\d+)\/parts\/(\d+)$/);
  if (part && request.method === 'PUT') return route(part[1], part[2], { pushId: part[3], pack: Number(part[4]), part: Number(part[5]), action: 'part' });
  const complete = path.match(/^\/v1\/repositories\/([^/]+)\/([^/]+)\/pushes\/(push_[a-z0-9]+)\/complete$/);
  if (complete && request.method === 'POST') return route(complete[1], complete[2], { pushId: complete[3], action: 'complete' });
  const download = path.match(/^\/v1\/repositories\/([^/]+)\/([^/]+)\/generations\/(\d+)\/packs\/([0-9a-f]{40,64})\/(pack|idx)$/);
  if (download && request.method === 'GET') return route(download[1], download[2], { generation: Number(download[3]), packId: download[4], kind: download[5] as 'pack' | 'idx', action: 'download' });
  return null;
}

function route(ownerValue: string, repositoryValue: string, rest: Omit<PushRoute, 'owner' | 'repository'>): PushRoute | null {
  const owner = decodeURIComponent(ownerValue);
  const repository = decodeURIComponent(repositoryValue);
  if (!safeSegment(owner) || !safeSegment(repository)) return null;
  return { owner, repository, ...rest };
}

export async function handleNativePush(request: Request, env: GitEdgeEnv, route: PushRoute): Promise<Response> {
  try {
    const authorization = await authorizeGit(request, env, route.owner, route.repository, ['snapshot', 'download'].includes(route.action) ? 'git-upload-pack' : 'git-receive-pack');
    const repository = authorization.storageKey;
    if (route.action === 'create') return createPush(request, env, repository, authorization.organizationId);
    if (route.action === 'snapshot') return storageSnapshot(env, route.owner, route.repository, repository);
    if (route.action === 'download') return downloadPack(env, repository, route);
    const session = await uploadSession(env, route.pushId!).request<UploadSnapshotResponse>('/snapshot');
    if (session.session.repository !== repository) return failure(404, 'push_not_found', 'Push not found.');
    if (route.action === 'part') return uploadPart(request, env, route, session.session);
    return completePush(env, route.owner, route.repository, authorization.organizationId, authorization.repositoryId, session.session);
  } catch (error) {
    if (error instanceof AuthorizationError) return failure(error.status, 'git_access_denied', error.message);
    if (error instanceof StateRequestError) return failure(error.status, error.code, error.message);
    console.error(error);
    return failure(500, 'push_failed', error instanceof Error ? error.message : 'Push failed.');
  }
}

async function downloadPack(env: GitEdgeEnv, repository: string, route: PushRoute) {
  const generation = await repositoryState(env, repository).request<{ generation: { manifestKey: string; manifestHash: string } }>(`/generations/${route.generation}`);
  const object = await env.REPOSITORIES.get(generation.generation.manifestKey);
  if (!object) return failure(404, 'generation_not_found', 'Repository generation not found.');
  const source = await new Response(object.body).text();
  if (await sha256(source) !== generation.generation.manifestHash) return failure(502, 'manifest_corrupt', 'Repository generation manifest failed its integrity check.');
  const manifest = JSON.parse(source) as { packs: Array<{ id: string; packKey: string; indexKey: string }> };
  const pack = manifest.packs.find((value) => value.id === route.packId);
  if (!pack) return failure(404, 'pack_not_found', 'Pack not found in this repository generation.');
  const stored = await env.REPOSITORIES.get(route.kind === 'pack' ? pack.packKey : pack.indexKey);
  if (!stored) return failure(410, 'pack_retired', 'This repository generation has retired. Fetch the current generation.');
  return new Response(stored.body, { headers: {
    'content-type': route.kind === 'pack' ? 'application/x-git-packed-objects' : 'application/x-git-packed-objects-toc',
    'content-length': String(stored.size), etag: stored.httpEtag,
    'cache-control': 'private, max-age=3600, immutable'
  } });
}

async function sha256(value: string) {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function createPush(request: Request, env: GitEdgeEnv, repository: string, organizationId: string) {
  const body = await request.json<Record<string, unknown>>().catch(() => null);
  if (!body || !Array.isArray(body.packs) || body.packs.length > 4 || !object(body.refs) || !object(body.expectedRefs)) return failure(422, 'invalid_push', 'Expected refs, proposed refs, and up to four packs are required.');
  const sizes = body.packs.map((value) => object(value) ? Number(value.bytes) : Number.NaN);
  if (sizes.some((bytes) => !Number.isSafeInteger(bytes) || bytes < 1)) return failure(422, 'invalid_push', 'Every pack needs a positive byte size.');
  const maximumBytes = sizes.reduce((total, bytes) => total + bytes, 0);
  if (maximumBytes > STORAGE_LIMITS.pushBytes) return failure(413, 'push_too_large', 'Pushes are limited to 256 MiB of compressed pack data.');
  const pushId = `push_${crypto.randomUUID().replaceAll('-', '')}`;
  const expiresAt = Date.now() + STORAGE_LIMITS.leaseSeconds * 1000;
  const plans: PackPlan[] = sizes.map((bytes, number) => ({ bytes, parts: Math.ceil(bytes / STORAGE_LIMITS.partBytes), key: `quarantine/${repository}/${pushId}/${number}.pack` }));
  const quota = organizationQuota(env, organizationId);
  const repo = repositoryState(env, repository);
  const uploads = uploadSession(env, pushId);
  const created: R2MultipartUpload[] = [];
  try {
    await quota.request('/reserve', { id: pushId, repository, maximumBytes, expiresAt });
    const leased = await repo.request<RepositorySnapshotResponse>('/begin', { pushId, reservationId: pushId, expiresAt, expectedRefs: body.expectedRefs, proposedRefs: body.refs });
    await uploads.request('/initialize', { pushId, repository, organizationId, expiresAt, expectedGeneration: leased.state.generation, refs: body.refs, packs: plans });
    for (const [number, plan] of plans.entries()) {
      const multipart = await env.REPOSITORIES.createMultipartUpload(plan.key, { httpMetadata: { contentType: 'application/x-git-packed-objects' } });
      created.push(multipart);
      await uploads.request('/attach', { pack: number, uploadId: multipart.uploadId });
    }
    return Response.json({ push: { id: pushId, expiresAt, maximumBytes, partBytes: STORAGE_LIMITS.partBytes, packs: plans.map((plan, number) => ({ number, bytes: plan.bytes, parts: plan.parts })) } }, { status: 201 });
  } catch (error) {
    await Promise.allSettled(created.map((upload) => upload.abort()));
    await Promise.allSettled([repo.request('/abort', { pushId }), quota.request('/release', { id: pushId }), uploads.request('/aborted', {})]);
    throw error;
  }
}

async function uploadPart(request: Request, env: GitEdgeEnv, route: PushRoute, session: UploadSnapshotResponse['session']) {
  if (!request.body) return failure(400, 'part_body_required', 'The pack part body is required.');
  const bytes = Number(request.headers.get('content-length'));
  if (!Number.isSafeInteger(bytes) || bytes < 1) return failure(411, 'content_length_required', 'Every pack part needs an exact Content-Length.');
  const client = uploadSession(env, session.pushId);
  await client.request('/claim', { pack: route.pack, part: route.part, bytes });
  const pack = session.packs[route.pack!];
  if (!pack?.multipartUploadId) return failure(409, 'upload_not_ready', 'The R2 multipart upload is not ready.');
  try {
    const uploaded = await env.REPOSITORIES.resumeMultipartUpload(pack.key, pack.multipartUploadId).uploadPart(route.part!, request.body);
    await client.request('/complete-part', { pack: route.pack, part: route.part, etag: uploaded.etag });
    return new Response(null, { status: 204, headers: { etag: uploaded.etag } });
  } catch (error) {
    await client.request('/fail-part', { pack: route.pack, part: route.part }).catch(() => {});
    throw error;
  }
}

async function completePush(env: GitEdgeEnv, owner: string, name: string, organizationId: string, repositoryId: string, session: UploadSnapshotResponse['session']) {
  const repository = repositoryId;
  const uploads = uploadSession(env, session.pushId);
  try {
    const ready = await uploads.request<{ packs: ReadyPack[] }>('/ready', {});
    for (const pack of ready.packs) {
      await env.REPOSITORIES.resumeMultipartUpload(pack.key, pack.multipartUploadId).complete(pack.uploadedParts);
    }
    await uploads.request('/uploaded', {});
  } catch (error) {
    await abortStoredPush(env, repository, organizationId, session);
    throw error;
  }
  const uploaded = await uploads.request<UploadSnapshotResponse>('/snapshot');
  const published = await finalizeUploadedPush(env, repository, organizationId, uploaded.session);
  await scheduleRepositoryIndex(env, owner, name, repositoryId, published.generation).catch((error) => console.error('repository metadata indexing scheduling deferred', error));
  const forceCompaction = uploaded.session.packs.length === 0 && published.storedBytes > 0;
  if (published.packs.length >= 12 || forceCompaction) await scheduleCompaction(env, owner, name, repositoryId, organizationId, forceCompaction).catch((error) => console.error('repository compaction scheduling deferred', error));
  return Response.json({ repository: { generation: published.generation, refsVersion: published.refsVersion, refs: published.refs, manifest: published.manifestKey } });
}

async function abortStoredPush(env: GitEdgeEnv, repository: string, organizationId: string, session: UploadSnapshotResponse['session']) {
  await Promise.allSettled(session.packs.flatMap((pack) => pack.multipartUploadId ? [env.REPOSITORIES.resumeMultipartUpload(pack.key, pack.multipartUploadId).abort()] : []));
  await Promise.allSettled([...session.packs.map((pack) => pack.key), ...session.cleanupKeys].map((key) => env.REPOSITORIES.delete(key)));
  await Promise.allSettled([
    repositoryState(env, repository).request('/abort', { pushId: session.pushId }),
    organizationQuota(env, organizationId).request('/release', { id: session.pushId }),
    uploadSession(env, session.pushId).request('/aborted', {})
  ]);
}

async function storageSnapshot(env: GitEdgeEnv, owner: string, name: string, storageKey: string) {
  const snapshot = await repositoryState(env, storageKey).request<RepositorySnapshotResponse>('/snapshot');
  const base = `/v1/repositories/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/generations/${snapshot.state.generation}/packs`;
  return Response.json({ repository: {
    generation: snapshot.state.generation,
    refsVersion: snapshot.state.refsVersion,
    refs: snapshot.state.refs,
    packs: snapshot.state.packs.map((pack) => ({
      id: pack.id, compressedBytes: pack.compressedBytes, expandedBytes: pack.expandedBytes,
      objectCount: pack.objectCount, packUrl: `${base}/${pack.id}/pack`, indexUrl: `${base}/${pack.id}/idx`
    }))
  } });
}

function object(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function safeSegment(value: string) {
  return value !== '.' && value !== '..' && /^[a-zA-Z0-9._-]+$/.test(value);
}

function failure(status: number, error: string, detail: string) {
  return Response.json({ error, detail }, { status });
}
