import { authorizeGit } from './authorization';
import { scheduleCompaction } from './compaction';
import type { GitEdgeEnv } from './env';
import { expectContainer, hydrateRepository, internalRequest, type ContainerStub } from './hydration';
import { scheduleRepositoryIndex } from './indexing';
import { finalizeUploadedPush } from './publication';
import { organizationQuota, repositoryState, uploadSession, type RepositorySnapshotResponse, type UploadSnapshotResponse } from './state-client';
import { STORAGE_LIMITS } from './storage-model';

type Capture = { refs: Record<string, string>; packBytes: number; hasPack: boolean };

export async function handleCompatibilityPush(request: Request, container: ContainerStub, env: GitEdgeEnv, owner: string, name: string) {
  const authorization = await authorizeGit(request, env, owner, name, 'git-receive-pack');
  const internalActorId = request.headers.get('x-marl-gateway-token') === env.MARL_GIT_GATEWAY_TOKEN
    ? await request.clone().json<{ actorId?: unknown }>().then((body) => typeof body.actorId === 'string' && body.actorId.length > 0 && body.actorId.length <= 200 ? body.actorId : undefined).catch(() => undefined)
    : undefined;
  const repository = authorization.storageKey;
  const repo = repositoryState(env, repository);
  const quota = organizationQuota(env, authorization.organizationId);
  const pushId = `push_${crypto.randomUUID().replaceAll('-', '')}`;
  const expiresAt = Date.now() + STORAGE_LIMITS.leaseSeconds * 1000;
  const maximumBytes = STORAGE_LIMITS.pushBytes;
  const current = await repo.request<RepositorySnapshotResponse>('/snapshot');
  const uploads = uploadSession(env, pushId);
  let captureCreated = false;
  let publicationStarted = false;
  try {
    await quota.request('/reserve', { id: pushId, repository, maximumBytes, expiresAt });
    await repo.request('/begin', { pushId, reservationId: pushId, expiresAt, expectedRefs: {}, proposedRefs: current.state.refs });
    await uploads.request('/initialize', { pushId, repository, organizationId: authorization.organizationId, expiresAt, expectedGeneration: current.state.generation, refs: current.state.refs, packs: [] });
    await hydrateRepository(container, env, owner, name, repository);
    const response = await container.fetch(request);
    const body = await response.arrayBuffer();
    if (!response.ok) {
      await abortCompatibilityPush(env, repository, authorization.organizationId, pushId);
      return new Response(body, response);
    }
    const base = `http://container/_marl/repositories/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/captures/${pushId}`;
    const captured = await expectContainer(container.fetch(internalRequest(base, env, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ knownRefs: current.state.refs })
    }))).then((value) => value.json<Capture>());
    captureCreated = true;
    if (refsEqual(current.state.refs, captured.refs)) {
      await abortCompatibilityPush(env, repository, authorization.organizationId, pushId);
      return new Response(body, response);
    }
    await repo.request('/propose', { pushId, refs: captured.refs });
    const plans = captured.hasPack ? [{ bytes: captured.packBytes, parts: Math.ceil(captured.packBytes / STORAGE_LIMITS.partBytes), key: `quarantine/${repository}/${pushId}/0.pack` }] : [];
    await uploads.request('/prepare-server', { refs: captured.refs, packs: plans });
    if (captured.hasPack) {
      if (captured.packBytes > maximumBytes) throw new Error('Compatibility push exceeded its reserved upload size.');
      const pack = await expectContainer(container.fetch(internalRequest(`${base}/pack`, env)));
      if (!pack.body) throw new Error('Compatibility capture returned an empty pack body.');
      await env.REPOSITORIES.put(plans[0].key, pack.body, { httpMetadata: { contentType: 'application/x-git-packed-objects' } });
    }
    await uploads.request('/server-uploaded', {});
    const session = await uploads.request<UploadSnapshotResponse>('/snapshot');
    publicationStarted = true;
    const published = await finalizeUploadedPush(env, repository, authorization.organizationId, session.session);
    await scheduleRepositoryIndex(env, owner, name, authorization.repositoryId, published.generation, authorization.actorId ?? internalActorId).catch((error) => console.error('repository metadata indexing scheduling deferred', error));
    const forceCompaction = session.session.packs.length === 0 && published.storedBytes > 0;
    if (published.packs.length >= 12 || forceCompaction) await scheduleCompaction(env, owner, name, authorization.repositoryId, authorization.organizationId, published.generation, forceCompaction).catch((error) => console.error('repository compaction scheduling deferred', error));
    return new Response(body, response);
  } catch (error) {
    if (!publicationStarted) await abortCompatibilityPush(env, repository, authorization.organizationId, pushId);
    throw error;
  } finally {
    if (captureCreated) {
      const base = `http://container/_marl/repositories/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/captures/${pushId}`;
      await container.fetch(internalRequest(base, env, { method: 'DELETE' })).catch(() => {});
    }
  }
}

function refsEqual(left: Record<string, string>, right: Record<string, string>) {
  const entries = Object.entries(left);
  return entries.length === Object.keys(right).length && entries.every(([name, objectId]) => right[name] === objectId);
}

async function abortCompatibilityPush(env: GitEdgeEnv, repository: string, organizationId: string, pushId: string) {
  const session = await uploadSession(env, pushId).request<UploadSnapshotResponse>('/snapshot').catch(() => null);
  if (session) await Promise.allSettled([...session.session.packs.map((pack) => pack.key), ...session.session.cleanupKeys].map((key) => env.REPOSITORIES.delete(key)));
  await Promise.allSettled([
    repositoryState(env, repository).request('/abort', { pushId }),
    organizationQuota(env, organizationId).request('/release', { id: pushId }),
    uploadSession(env, pushId).request('/aborted', {})
  ]);
}
