import { DurableObject } from 'cloudflare:workers';
import { abortPush, beginPush, emptyRepositoryState, proposePushRefs, publish, type RepositoryState } from './storage-model';
import { parseStateBody, stateFailure, stateResponse, trusted, type StateEnv } from './state-http';
import { beginPushBody, proposePushBody, publishBody, pushIdBody } from './state-schemas';

type IntegritySchedule = { generation: number; attempts: number; nextVerifyAt: number };
type RetirementSchedule = { deleteAfter: number; beforeGeneration: number; keys: string[]; attempts?: number };

export class RepositoryStateObject extends DurableObject<StateEnv> {
  async fetch(request: Request): Promise<Response> {
    if (!trusted(request, this.env)) return stateResponse({ error: 'not_found' }, 404);
    try {
      const path = new URL(request.url).pathname;
      const state = await this.ctx.storage.get<RepositoryState>('state') ?? emptyRepositoryState();
      if (request.method === 'GET' && path === '/snapshot') return stateResponse({ state });
      const generation = path.match(/^\/generations\/(\d+)$/);
      if (request.method === 'GET' && generation) {
        const value = await this.ctx.storage.get(`generation:${generation[1]}`);
        return value ? stateResponse({ generation: value }) : stateResponse({ error: 'generation_not_found' }, 404);
      }
      if (request.method === 'POST' && path === '/begin') {
        const body = await parseStateBody(request, beginPushBody);
        const next = beginPush(state, {
          id: body.pushId,
          reservationId: body.reservationId,
          expiresAt: body.expiresAt,
          proposedRefs: body.proposedRefs
        }, body.expectedRefs, Date.now());
        await this.ctx.storage.put('state', next);
        return stateResponse({ state: next });
      }
      if (request.method === 'POST' && path === '/publish') {
        const body = await parseStateBody(request, publishBody);
        const next = publish(state, body, Date.now());
        const previousIds = new Set(state.packs.map((pack) => pack.id));
        const actualBytes = next.packs.filter((pack) => !previousIds.has(pack.id)).reduce((total, pack) => total + pack.compressedBytes, 0);
        const removed = state.packs.filter((pack) => !next.packs.some((active) => active.id === pack.id));
        const values: Record<string, unknown> = {
          state: next,
          [`committed:${body.pushId}`]: {
            generation: next.generation,
            actualBytes,
            accountingDelta: next.storedBytes - state.storedBytes,
            manifestKey: next.manifestKey,
            manifestHash: next.manifestHash,
            committedAt: Date.now()
          },
          [`generation:${next.generation}`]: { manifestKey: next.manifestKey, manifestHash: next.manifestHash },
          integrity: { generation: next.generation, attempts: 0, nextVerifyAt: Date.now() }
        };
        if (removed.length) values[`retired:${next.generation}`] = { deleteAfter: Date.now() + 60 * 60 * 1000, beforeGeneration: next.generation, keys: removed.flatMap((pack) => [pack.packKey, pack.indexKey, pack.objectIndexKey]) };
        await this.ctx.storage.put(values);
        await this.ctx.storage.setAlarm(Date.now());
        return stateResponse({ state: next });
      }
      if (request.method === 'POST' && path === '/propose') {
        const body = await parseStateBody(request, proposePushBody);
        const next = proposePushRefs(state, body.pushId, body.refs, Date.now());
        await this.ctx.storage.put('state', next);
        return stateResponse({ state: next });
      }
      if (request.method === 'POST' && path === '/abort') {
        const body = await parseStateBody(request, pushIdBody);
        const next = abortPush(state, body.pushId);
        await this.ctx.storage.put('state', next);
        return stateResponse({ state: next });
      }
      if (request.method === 'POST' && path === '/committed') {
        const body = await parseStateBody(request, pushIdBody);
        const committed = await this.ctx.storage.get(`committed:${body.pushId}`);
        return committed ? stateResponse({ committed }) : stateResponse({ error: 'push_not_committed' }, 404);
      }
      if (request.method === 'POST' && path === '/acknowledge') {
        const body = await parseStateBody(request, pushIdBody);
        await this.ctx.storage.delete(`committed:${body.pushId}`);
        return new Response(null, { status: 204 });
      }
      return stateResponse({ error: 'not_found' }, 404);
    } catch (error) {
      return stateFailure(error);
    }
  }

  async alarm(): Promise<void> {
    const integrity = await this.ctx.storage.get<IntegritySchedule>('integrity');
    let nextAlarm: number | null = null;
    if (integrity && integrity.nextVerifyAt <= Date.now()) {
      const state = await this.ctx.storage.get<RepositoryState>('state') ?? emptyRepositoryState();
      try {
        await verifyRepositoryIntegrity(this.env.REPOSITORIES, state);
        const latest = await this.ctx.storage.get<IntegritySchedule>('integrity');
        if (latest?.generation === integrity.generation) {
          const nextVerifyAt = Date.now() + 24 * 60 * 60 * 1000;
          await this.ctx.storage.put({ integrity: { generation: integrity.generation, attempts: 0, nextVerifyAt }, 'integrity:last': { generation: integrity.generation, verifiedAt: Date.now() } });
          nextAlarm = nextVerifyAt;
        }
      } catch (error) {
        const attempts = integrity.attempts + 1;
        const nextVerifyAt = Date.now() + Math.min(5 * 60 * 1000 * 2 ** Math.min(attempts - 1, 4), 60 * 60 * 1000);
        const latest = await this.ctx.storage.get<IntegritySchedule>('integrity');
        if (latest?.generation === integrity.generation) await this.ctx.storage.put('integrity', { generation: integrity.generation, attempts, nextVerifyAt });
        nextAlarm = nextVerifyAt;
        console.error('repository integrity verification failed', error);
      }
    } else if (integrity) {
      nextAlarm = integrity.nextVerifyAt;
    }
    const retired = await this.ctx.storage.list<RetirementSchedule>({ prefix: 'retired:' });
    for (const [key, value] of retired) {
      if (value.deleteAfter > Date.now()) {
        nextAlarm = nextAlarm === null ? value.deleteAfter : Math.min(nextAlarm, value.deleteAfter);
        continue;
      }
      const currentState = await this.ctx.storage.get<RepositoryState>('state') ?? emptyRepositoryState();
      const activeKeys = new Set(currentState.packs.flatMap((pack) => [pack.packKey, pack.indexKey, pack.objectIndexKey]));
      const remainingKeys: string[] = [];
      for (const objectKey of value.keys) {
        if (activeKeys.has(objectKey)) continue;
        try {
          await this.env.REPOSITORIES.delete(objectKey);
        } catch (error) {
          remainingKeys.push(objectKey);
          console.error('canonical object retirement deferred', error);
        }
      }
      let manifestRetirementDeferred = false;
      const generations = await this.ctx.storage.list<{ manifestKey: string }>({ prefix: 'generation:' });
      for (const [generationKey, generation] of generations) {
        if (Number(generationKey.slice('generation:'.length)) >= value.beforeGeneration) continue;
        try {
          await this.env.REPOSITORIES.delete(generation.manifestKey);
          await this.ctx.storage.delete(generationKey);
        } catch (error) {
          manifestRetirementDeferred = true;
          console.error('repository generation retirement deferred', error);
        }
      }
      if (remainingKeys.length || manifestRetirementDeferred) {
        const attempts = (value.attempts ?? 0) + 1;
        const deleteAfter = Date.now() + Math.min(60 * 60 * 1000 * 2 ** Math.min(attempts - 1, 5), 24 * 60 * 60 * 1000);
        await this.ctx.storage.put(key, { ...value, keys: remainingKeys, attempts, deleteAfter });
        nextAlarm = nextAlarm === null ? deleteAfter : Math.min(nextAlarm, deleteAfter);
        continue;
      }
      await this.ctx.storage.delete(key);
    }
    if (nextAlarm !== null) await this.ctx.storage.setAlarm(nextAlarm);
  }
}

async function verifyRepositoryIntegrity(bucket: R2Bucket, state: RepositoryState) {
  if (state.generation === 0) return;
  if (!state.manifestKey || !state.manifestHash) throw new Error('Published repository state has no manifest.');
  const manifestObject = await bucket.get(state.manifestKey);
  if (!manifestObject) throw new Error(`Repository manifest ${state.manifestKey} is missing.`);
  const manifest = await manifestObject.text();
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
