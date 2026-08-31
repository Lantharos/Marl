import { DurableObject } from 'cloudflare:workers';
import { readBoundedJson, readBoundedText } from './bounded-body';
import { RepositoryStateStore } from './repository-state-store';
import { abortPush, beginPush, proposePushRefs, publish, type RepositoryState } from './storage-model';
import { parseStateBody, stateFailure, stateResponse, trusted, type StateEnv } from './state-http';
import { beginPushBody, forkStateBody, proposePushBody, publishBody, pushIdBody } from './state-schemas';

export class RepositoryStateObject extends DurableObject<StateEnv> {
  private store: RepositoryStateStore;

  constructor(ctx: DurableObjectState, env: StateEnv) {
    super(ctx, env);
    this.store = new RepositoryStateStore(ctx.storage);
  }

  async fetch(request: Request): Promise<Response> {
    if (!trusted(request, this.env)) return stateResponse({ error: 'not_found' }, 404);
    try {
      const path = new URL(request.url).pathname;
      const object = path.match(/^\/objects\/([0-9a-f]{40,64})$/);
      if (request.method === 'GET' && object) {
        const locator = this.store.object(object[1]);
        return locator ? stateResponse({ locator }) : stateResponse({ error: 'object_not_found' }, 404);
      }
      const offset = path.match(/^\/packs\/([0-9a-f]{40,64})\/offsets\/(\d+)$/);
      if (request.method === 'GET' && offset) {
        const locator = this.store.objectAt(offset[1], Number(offset[2]));
        return locator ? stateResponse({ locator }) : stateResponse({ error: 'object_not_found' }, 404);
      }
      if (request.method === 'POST' && path === '/catalog') {
        const body = await readBoundedJson<{ packId?: unknown; objects?: unknown }>(request, 1024 * 1024);
        if (!body || typeof body !== 'object') return stateResponse({ error: 'invalid_catalog' }, 422);
        if (typeof body.packId !== 'string' || !/^[0-9a-f]{40,64}$/.test(body.packId) || !Array.isArray(body.objects) || body.objects.length > 500) return stateResponse({ error: 'invalid_catalog' }, 422);
        const objects = body.objects.filter((value): value is { id: string; kind: string; size: number; packedBytes: number; offset: number } => {
          if (!value || typeof value !== 'object') return false;
          const object = value as Record<string, unknown>;
          return typeof object.id === 'string' && /^[0-9a-f]{40,64}$/.test(object.id) && typeof object.kind === 'string' && ['commit', 'tree', 'blob', 'tag'].includes(object.kind) && [object.size, object.packedBytes, object.offset].every((number) => typeof number === 'number' && Number.isSafeInteger(number) && number >= 0);
        });
        if (objects.length !== body.objects.length) return stateResponse({ error: 'invalid_catalog' }, 422);
        this.store.catalog(body.packId, objects);
        return new Response(null, { status: 204 });
      }
      if (request.method === 'GET' && path === '/catalogs') return stateResponse({ catalogs: this.store.catalogCounts() });
      const state = this.store.read();
      if (request.method === 'GET' && path === '/snapshot') return stateResponse({ state });
      const generation = path.match(/^\/generations\/(\d+)$/);
      if (request.method === 'GET' && generation) {
        const value = this.store.generation(Number(generation[1]));
        return value ? stateResponse({ generation: value }) : stateResponse({ error: 'generation_not_found' }, 404);
      }
      if (request.method === 'POST' && path === '/begin') {
        const body = await parseStateBody(request, beginPushBody);
        const next = beginPush(state, { id: body.pushId, reservationId: body.reservationId, expiresAt: body.expiresAt, proposedRefs: body.proposedRefs }, body.expectedRefs, Date.now());
        this.store.write(state, next);
        return stateResponse({ state: next });
      }
      if (request.method === 'POST' && path === '/publish') {
        const body = await parseStateBody(request, publishBody);
        const now = Date.now();
        const next = publish(state, body, now);
        const removed = state.packs.filter((pack) => !next.packs.some((active) => active.id === pack.id));
        await this.ctx.storage.setAlarm(now);
        this.store.publish(state, next, body.pushId, removed, now);
        return stateResponse({ state: next });
      }
      if (request.method === 'POST' && path === '/fork') {
        const body = await parseStateBody(request, forkStateBody);
        const state: RepositoryState = { generation: 1, refsVersion: Object.keys(body.refs).length ? 1 : 0, refs: body.refs, manifestKey: body.manifestKey, manifestHash: body.manifestHash, packs: body.packs, storedBytes: body.packs.reduce((total, pack) => total + pack.compressedBytes, 0), activePush: null };
        this.store.initializeFork(state, Date.now());
        return stateResponse({ state }, 201);
      }
      if (request.method === 'POST' && path === '/propose') {
        const body = await parseStateBody(request, proposePushBody);
        const next = proposePushRefs(state, body.pushId, body.refs, Date.now());
        this.store.write(state, next);
        return stateResponse({ state: next });
      }
      if (request.method === 'POST' && path === '/abort') {
        const body = await parseStateBody(request, pushIdBody);
        const next = abortPush(state, body.pushId);
        this.store.write(state, next);
        return stateResponse({ state: next });
      }
      if (request.method === 'POST' && path === '/committed') {
        const body = await parseStateBody(request, pushIdBody);
        const committed = this.store.committed(body.pushId);
        return committed ? stateResponse({ committed }) : stateResponse({ error: 'push_not_committed' }, 404);
      }
      if (request.method === 'POST' && path === '/acknowledge') {
        const body = await parseStateBody(request, pushIdBody);
        this.store.acknowledge(body.pushId);
        return new Response(null, { status: 204 });
      }
      return stateResponse({ error: 'not_found' }, 404);
    } catch (error) {
      return stateFailure(error);
    }
  }

  async alarm(): Promise<void> {
    let nextAlarm = await this.verifyIntegrity();
    const state = this.store.read();
    const activeKeys = new Set(state.packs.flatMap((pack) => [pack.packKey, pack.indexKey, pack.objectIndexKey]));
    for (const retirement of this.store.retirements()) {
      if (retirement.deleteAfter > Date.now()) {
        nextAlarm = earlier(nextAlarm, retirement.deleteAfter);
        continue;
      }
      const remainingKeys: string[] = [];
      for (const objectKey of this.store.retirementKeys(retirement.generation)) {
        if (activeKeys.has(objectKey)) continue;
        try { await this.env.REPOSITORIES.delete(objectKey); }
        catch (error) { remainingKeys.push(objectKey); console.error('canonical object retirement deferred', error); }
      }
      let manifestRetirementDeferred = false;
      for (const generation of this.store.generationsBefore(retirement.beforeGeneration)) {
        try { await this.env.REPOSITORIES.delete(generation.manifestKey); this.store.deleteGeneration(generation.generation); }
        catch (error) { manifestRetirementDeferred = true; console.error('repository generation retirement deferred', error); }
      }
      if (remainingKeys.length || manifestRetirementDeferred) {
        const attempts = retirement.attempts + 1;
        const deleteAfter = Date.now() + Math.min(60 * 60 * 1000 * 2 ** Math.min(attempts - 1, 5), 24 * 60 * 60 * 1000);
        this.store.replaceRetirementKeys(retirement.generation, remainingKeys, attempts, deleteAfter);
        nextAlarm = earlier(nextAlarm, deleteAfter);
      } else {
        this.store.deleteRetirement(retirement.generation);
      }
    }
    if (nextAlarm !== null) await this.ctx.storage.setAlarm(nextAlarm);
  }

  private async verifyIntegrity() {
    const integrity = this.store.integrity();
    if (!integrity) return null;
    if (integrity.nextVerifyAt > Date.now()) return integrity.nextVerifyAt;
    try {
      await verifyRepositoryIntegrity(this.env.REPOSITORIES, this.store.read());
      const nextVerifyAt = Date.now() + 24 * 60 * 60 * 1000;
      this.store.updateIntegrity(integrity.generation, 0, nextVerifyAt, Date.now());
      return nextVerifyAt;
    } catch (error) {
      const attempts = integrity.attempts + 1;
      const nextVerifyAt = Date.now() + Math.min(5 * 60 * 1000 * 2 ** Math.min(attempts - 1, 4), 60 * 60 * 1000);
      this.store.updateIntegrity(integrity.generation, attempts, nextVerifyAt);
      console.error('repository integrity verification failed', error);
      return nextVerifyAt;
    }
  }
}

function earlier(current: number | null, candidate: number) {
  return current === null ? candidate : Math.min(current, candidate);
}

async function verifyRepositoryIntegrity(bucket: R2Bucket, state: RepositoryState) {
  if (state.generation === 0) return;
  if (!state.manifestKey || !state.manifestHash) throw new Error('Published repository state has no manifest.');
  const manifestObject = await bucket.get(state.manifestKey);
  if (!manifestObject) throw new Error(`Repository manifest ${state.manifestKey} is missing.`);
  const manifest = await readBoundedText(manifestObject.body, 16 * 1024 * 1024);
  if (!manifest) throw new Error(`Repository manifest ${state.manifestKey} is empty or too large.`);
  if (await sha256(manifest) !== state.manifestHash) throw new Error(`Repository manifest ${state.manifestKey} is corrupt.`);
  const expected = JSON.stringify({ generation: state.generation, refsVersion: state.refsVersion, refs: state.refs, packs: state.packs });
  if (manifest !== expected) throw new Error(`Repository manifest ${state.manifestKey} disagrees with repository state.`);
  for (const pack of state.packs) {
    const [packObject, indexObject, objectIndex] = await Promise.all([bucket.head(pack.packKey), bucket.head(pack.indexKey), bucket.head(pack.objectIndexKey)]);
    if (!packObject || packObject.size !== pack.compressedBytes) throw new Error(`Canonical pack ${pack.id} is missing or truncated.`);
    if (!indexObject || indexObject.size === 0) throw new Error(`Canonical pack index ${pack.id} is missing or empty.`);
    if (!objectIndex || objectIndex.size === 0) throw new Error(`Canonical object index ${pack.id} is missing or empty.`);
  }
}

async function sha256(value: string) {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}
