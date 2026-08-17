import { DurableObject } from 'cloudflare:workers';
import { OrganizationQuotaStore } from './organization-quota-store';
import { parseStateBody, stateFailure, stateResponse, trusted, type StateEnv } from './state-http';
import { adjustStorageBody, releaseStorageBody, reserveStorageBody, settleStorageBody } from './state-schemas';

export class OrganizationQuotaObject extends DurableObject<StateEnv> {
  private store: OrganizationQuotaStore;

  constructor(ctx: DurableObjectState, env: StateEnv) {
    super(ctx, env);
    this.store = new OrganizationQuotaStore(ctx.storage);
  }

  async fetch(request: Request): Promise<Response> {
    if (!trusted(request, this.env)) return stateResponse({ error: 'not_found' }, 404);
    try {
      const path = new URL(request.url).pathname;
      const now = Date.now();
      if (request.method === 'GET' && path === '/snapshot') return stateResponse({ state: this.store.snapshot(now) });
      if (request.method === 'POST' && path === '/reserve') {
        const body = await parseStateBody(request, reserveStorageBody);
        return stateResponse({ reservation: this.store.reserve({ ...body, state: 'reserved' }, now) }, 201);
      }
      if (request.method === 'POST' && path === '/settle') {
        const body = await parseStateBody(request, settleStorageBody);
        this.store.settle(body.id, body.actualBytes, now);
        return stateResponse({ settled: true });
      }
      if (request.method === 'POST' && path === '/release') {
        const body = await parseStateBody(request, releaseStorageBody);
        this.store.release(body.id, now);
        return stateResponse({ released: true });
      }
      if (request.method === 'POST' && path === '/adjust') {
        const body = await parseStateBody(request, adjustStorageBody);
        this.store.adjust(body.id, body.deltaBytes, now);
        return stateResponse({ adjusted: true });
      }
      return stateResponse({ error: 'not_found' }, 404);
    } catch (error) {
      return stateFailure(error);
    }
  }
}
