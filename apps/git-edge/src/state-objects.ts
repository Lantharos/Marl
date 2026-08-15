import { DurableObject } from 'cloudflare:workers';
import { StorageError, abortPush, adjustStorage, beginPush, emptyOrganizationQuota, emptyRepositoryState, proposePushRefs, publish, releaseReservation, reserveStorage, settleStorage, type OrganizationQuotaState, type Publication, type RepositoryState, type StorageReservation } from './storage-model';
import { attachMultipart, claimPart, completePart, createUploadSession, failPart, markServerUploaded, markUploaded, prepareServerUpload, trackCleanupKey, uploadedParts, type UploadSession } from './upload-model';

export interface StateEnv {
  STY_GIT_GATEWAY_TOKEN: string;
  REPOSITORY_STATE: DurableObjectNamespace;
  ORGANIZATION_QUOTAS: DurableObjectNamespace;
  REPOSITORIES: R2Bucket;
}

export class RepositoryStateObject extends DurableObject<StateEnv> {
  async fetch(request: Request): Promise<Response> {
    if (!trusted(request, this.env)) return response({ error: 'not_found' }, 404);
    try {
      const path = new URL(request.url).pathname;
      const state = await this.ctx.storage.get<RepositoryState>('state') ?? emptyRepositoryState();
      if (request.method === 'GET' && path === '/snapshot') return response({ state });
      const generation = path.match(/^\/generations\/(\d+)$/);
      if (request.method === 'GET' && generation) {
        const value = await this.ctx.storage.get(`generation:${generation[1]}`);
        return value ? response({ generation: value }) : response({ error: 'generation_not_found' }, 404);
      }
      const body = await request.json<Record<string, unknown>>();
      if (request.method === 'POST' && path === '/begin') {
        const next = beginPush(state, {
          id: requiredString(body.pushId),
          reservationId: requiredString(body.reservationId),
          expiresAt: requiredInteger(body.expiresAt),
          proposedRefs: requiredRefs(body.proposedRefs)
        }, requiredExpectedRefs(body.expectedRefs), Date.now());
        await this.ctx.storage.put('state', next);
        return response({ state: next });
      }
      if (request.method === 'POST' && path === '/publish') {
        const next = publish(state, body as unknown as Publication, Date.now());
        const previousIds = new Set(state.packs.map((pack) => pack.id));
        const actualBytes = next.packs.filter((pack) => !previousIds.has(pack.id)).reduce((total, pack) => total + pack.compressedBytes, 0);
        const removed = state.packs.filter((pack) => !next.packs.some((active) => active.id === pack.id));
        const values: Record<string, unknown> = {
          state: next,
          [`committed:${requiredString(body.pushId)}`]: { generation: next.generation, actualBytes, accountingDelta: next.storedBytes - state.storedBytes, committedAt: Date.now() },
          [`generation:${next.generation}`]: { manifestKey: next.manifestKey, manifestHash: next.manifestHash }
        };
        if (removed.length) values[`retired:${next.generation}`] = { deleteAfter: Date.now() + 60 * 60 * 1000, beforeGeneration: next.generation, keys: removed.flatMap((pack) => [pack.packKey, pack.indexKey]) };
        await this.ctx.storage.put(values);
        if (removed.length) await this.ctx.storage.setAlarm(Date.now() + 60 * 60 * 1000);
        return response({ state: next });
      }
      if (request.method === 'POST' && path === '/propose') {
        const next = proposePushRefs(state, requiredString(body.pushId), requiredRefs(body.refs), Date.now());
        await this.ctx.storage.put('state', next);
        return response({ state: next });
      }
      if (request.method === 'POST' && path === '/abort') {
        const next = abortPush(state, requiredString(body.pushId));
        await this.ctx.storage.put('state', next);
        return response({ state: next });
      }
      if (request.method === 'POST' && path === '/committed') {
        const committed = await this.ctx.storage.get(`committed:${requiredString(body.pushId)}`);
        return committed ? response({ committed }) : response({ error: 'push_not_committed' }, 404);
      }
      return response({ error: 'not_found' }, 404);
    } catch (error) {
      return failure(error);
    }
  }

  async alarm(): Promise<void> {
    const retired = await this.ctx.storage.list<{ deleteAfter: number; beforeGeneration: number; keys: string[] }>({ prefix: 'retired:' });
    let nextAlarm: number | null = null;
    for (const [key, value] of retired) {
      if (value.deleteAfter > Date.now()) {
        nextAlarm = nextAlarm === null ? value.deleteAfter : Math.min(nextAlarm, value.deleteAfter);
        continue;
      }
      await Promise.allSettled(value.keys.map((objectKey) => this.env.REPOSITORIES.delete(objectKey)));
      const generations = await this.ctx.storage.list<{ manifestKey: string }>({ prefix: 'generation:' });
      for (const [generationKey, generation] of generations) {
        if (Number(generationKey.slice('generation:'.length)) >= value.beforeGeneration) continue;
        await this.env.REPOSITORIES.delete(generation.manifestKey);
        await this.ctx.storage.delete(generationKey);
      }
      const committed = await this.ctx.storage.list({ prefix: 'committed:' });
      if (committed.size) await this.ctx.storage.delete([...committed.keys()]);
      await this.ctx.storage.delete(key);
    }
    if (nextAlarm !== null) await this.ctx.storage.setAlarm(nextAlarm);
  }
}

export class OrganizationQuotaObject extends DurableObject<StateEnv> {
  async fetch(request: Request): Promise<Response> {
    if (!trusted(request, this.env)) return response({ error: 'not_found' }, 404);
    try {
      const path = new URL(request.url).pathname;
      const state = await this.ctx.storage.get<OrganizationQuotaState>('state') ?? emptyOrganizationQuota();
      if (request.method === 'GET' && path === '/snapshot') return response({ state });
      const body = await request.json<Record<string, unknown>>();
      if (request.method === 'POST' && path === '/reserve') {
        const reservation: StorageReservation = {
          id: requiredString(body.id),
          repository: requiredString(body.repository),
          maximumBytes: requiredInteger(body.maximumBytes),
          expiresAt: requiredInteger(body.expiresAt),
          state: 'reserved'
        };
        const next = reserveStorage(state, reservation, Date.now());
        await this.ctx.storage.put('state', next);
        return response({ reservation: next.reservations[reservation.id] }, 201);
      }
      if (request.method === 'POST' && path === '/settle') {
        const next = settleStorage(state, requiredString(body.id), requiredInteger(body.actualBytes), Date.now());
        await this.ctx.storage.put('state', next);
        return response({ state: next });
      }
      if (request.method === 'POST' && path === '/release') {
        const next = releaseReservation(state, requiredString(body.id), Date.now());
        await this.ctx.storage.put('state', next);
        return response({ state: next });
      }
      if (request.method === 'POST' && path === '/adjust') {
        const next = adjustStorage(state, requiredString(body.id), requiredInteger(body.deltaBytes));
        await this.ctx.storage.put('state', next);
        return response({ state: next });
      }
      return response({ error: 'not_found' }, 404);
    } catch (error) {
      return failure(error);
    }
  }
}

export class UploadSessionObject extends DurableObject<StateEnv> {
  async fetch(request: Request): Promise<Response> {
    if (!trusted(request, this.env)) return response({ error: 'not_found' }, 404);
    try {
      const path = new URL(request.url).pathname;
      const existing = await this.ctx.storage.get<UploadSession>('session');
      if (request.method === 'GET' && path === '/snapshot') return existing ? response({ session: existing }) : response({ error: 'upload_missing' }, 404);
      const body = await request.json<Record<string, unknown>>();
      if (request.method === 'POST' && path === '/initialize') {
        const proposed = createUploadSession(requiredString(body.pushId), requiredString(body.repository), requiredString(body.organizationId), requiredInteger(body.expiresAt), requiredInteger(body.expectedGeneration), requiredRefs(body.refs), requiredPacks(body.packs));
        if (existing && JSON.stringify(existing) !== JSON.stringify(proposed)) throw new StorageError('upload_conflict', 'The upload session already exists with different limits.');
        if (!existing) {
          await this.ctx.storage.put('session', proposed);
          await this.ctx.storage.setAlarm(proposed.expiresAt);
        }
        return response({ session: existing ?? proposed }, 201);
      }
      if (!existing) throw new StorageError('upload_missing', 'The upload session does not exist.');
      if (request.method === 'POST' && path === '/attach') {
        const next = attachMultipart(existing, requiredInteger(body.pack), requiredString(body.uploadId));
        await this.ctx.storage.put('session', next);
        return response({ session: next });
      }
      if (request.method === 'POST' && path === '/claim') {
        const next = claimPart(existing, requiredInteger(body.pack), requiredInteger(body.part), requiredInteger(body.bytes), Date.now());
        await this.ctx.storage.put('session', next);
        return response({ session: next });
      }
      if (request.method === 'POST' && path === '/complete-part') {
        const next = completePart(existing, requiredInteger(body.pack), requiredInteger(body.part), requiredString(body.etag));
        await this.ctx.storage.put('session', next);
        return response({ session: next });
      }
      if (request.method === 'POST' && path === '/fail-part') {
        const next = failPart(existing, requiredInteger(body.pack), requiredInteger(body.part));
        await this.ctx.storage.put('session', next);
        return response({ session: next });
      }
      if (request.method === 'POST' && path === '/ready') {
        markUploaded(existing, Date.now());
        return response({ session: existing, packs: existing.packs.map((pack) => ({ ...pack, uploadedParts: uploadedParts(existing, pack.number) })) });
      }
      if (request.method === 'POST' && path === '/uploaded') {
        const next = markUploaded(existing, Date.now());
        await this.ctx.storage.put('session', next);
        return response({ session: next });
      }
      if (request.method === 'POST' && path === '/prepare-server') {
        const next = prepareServerUpload(existing, requiredRefs(body.refs), requiredPacks(body.packs), Date.now());
        await this.ctx.storage.put('session', next);
        return response({ session: next });
      }
      if (request.method === 'POST' && path === '/server-uploaded') {
        const next = markServerUploaded(existing, Date.now());
        await this.ctx.storage.put('session', next);
        return response({ session: next });
      }
      if (request.method === 'POST' && path === '/track') {
        const keys = Array.isArray(body.keys) ? body.keys.map(requiredString) : [requiredString(body.key)];
        const next = keys.reduce(trackCleanupKey, existing);
        await this.ctx.storage.put('session', next);
        return response({ session: next });
      }
      if (request.method === 'POST' && path === '/published') {
        const next = { ...existing, state: 'published' as const };
        await this.ctx.storage.put('session', next);
        await this.ctx.storage.deleteAlarm();
        return response({ session: next });
      }
      if (request.method === 'POST' && path === '/aborted') {
        const next = { ...existing, state: 'aborted' as const };
        await this.ctx.storage.put('session', next);
        await this.ctx.storage.deleteAlarm();
        return response({ session: next });
      }
      return response({ error: 'not_found' }, 404);
    } catch (error) {
      return failure(error);
    }
  }

  async alarm(): Promise<void> {
    const session = await this.ctx.storage.get<UploadSession>('session');
    if (!session || session.state === 'published' || session.state === 'aborted') return;
    try {
      const committed = await stateFetch(this.env.REPOSITORY_STATE, session.repository, this.env, '/committed', { pushId: session.pushId });
      if (committed.ok) {
        const value = await committed.json<{ committed: { actualBytes: number } }>();
        const settled = await stateFetch(this.env.ORGANIZATION_QUOTAS, session.organizationId, this.env, '/settle', { id: session.pushId, actualBytes: value.committed.actualBytes });
        if (!settled.ok) throw new Error(`Quota settlement failed with ${settled.status}.`);
        await this.ctx.storage.put('session', { ...session, state: 'published' });
        return;
      }
      if (committed.status !== 404) throw new Error(`Commit reconciliation failed with ${committed.status}.`);
      await Promise.allSettled(session.packs.map(async (pack) => {
        if (pack.multipartUploadId) await this.env.REPOSITORIES.resumeMultipartUpload(pack.key, pack.multipartUploadId).abort();
        await this.env.REPOSITORIES.delete(pack.key);
      }));
      await Promise.allSettled(session.cleanupKeys.map((key) => this.env.REPOSITORIES.delete(key)));
      await Promise.allSettled([
        stateFetch(this.env.REPOSITORY_STATE, session.repository, this.env, '/abort', { pushId: session.pushId }),
        stateFetch(this.env.ORGANIZATION_QUOTAS, session.organizationId, this.env, '/release', { id: session.pushId })
      ]);
      await this.ctx.storage.put('session', { ...session, state: 'aborted' });
    } catch (error) {
      console.error('upload expiry reconciliation failed', error);
      await this.ctx.storage.setAlarm(Date.now() + 60_000);
    }
  }
}

function stateFetch(namespace: DurableObjectNamespace, name: string, env: StateEnv, path: string, body: unknown) {
  const stub = namespace.get(namespace.idFromName(name));
  return stub.fetch(`http://state${path}`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-sty-storage-token': env.STY_GIT_GATEWAY_TOKEN }, body: JSON.stringify(body) });
}

function trusted(request: Request, env: StateEnv) {
  return Boolean(env.STY_GIT_GATEWAY_TOKEN) && request.headers.get('x-sty-storage-token') === env.STY_GIT_GATEWAY_TOKEN;
}

function requiredString(value: unknown) {
  if (typeof value !== 'string' || !value) throw new StorageError('invalid_request', 'A required string is missing.');
  return value;
}

function requiredInteger(value: unknown) {
  if (!Number.isSafeInteger(value)) throw new StorageError('invalid_request', 'A required integer is missing.');
  return value as number;
}

function requiredPacks(value: unknown) {
  if (!Array.isArray(value)) throw new StorageError('invalid_request', 'Upload packs are missing.');
  return value.map((pack) => {
    if (!pack || typeof pack !== 'object') throw new StorageError('invalid_request', 'An upload pack is invalid.');
    const record = pack as Record<string, unknown>;
    return { bytes: requiredInteger(record.bytes), parts: requiredInteger(record.parts), key: requiredString(record.key) };
  });
}

function requiredRefs(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new StorageError('invalid_request', 'Git refs are missing.');
  return Object.fromEntries(Object.entries(value).map(([name, objectId]) => [name, requiredString(objectId)]));
}

function requiredExpectedRefs(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new StorageError('invalid_request', 'Expected Git refs are missing.');
  return Object.fromEntries(Object.entries(value).map(([name, objectId]) => [name, objectId === null ? null : requiredString(objectId)]));
}

function failure(error: unknown) {
  return error instanceof StorageError ? response({ error: error.code, detail: error.message }, 409) : response({ error: 'storage_state_failed', detail: error instanceof Error ? error.message : 'Storage state failed.' }, 500);
}

function response(value: unknown, status = 200) {
  return Response.json(value, { status });
}
