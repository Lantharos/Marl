import { DurableObject } from 'cloudflare:workers';
import { adjustStorage, emptyOrganizationQuota, releaseReservation, reserveStorage, settleStorage, type OrganizationQuotaState, type StorageReservation } from './storage-model';
import { parseStateBody, stateFailure, stateResponse, trusted, type StateEnv } from './state-http';
import { adjustStorageBody, releaseStorageBody, reserveStorageBody, settleStorageBody } from './state-schemas';

export class OrganizationQuotaObject extends DurableObject<StateEnv> {
  async fetch(request: Request): Promise<Response> {
    if (!trusted(request, this.env)) return stateResponse({ error: 'not_found' }, 404);
    try {
      const path = new URL(request.url).pathname;
      const state = await this.ctx.storage.get<OrganizationQuotaState>('state') ?? emptyOrganizationQuota();
      if (request.method === 'GET' && path === '/snapshot') return stateResponse({ state });
      if (request.method === 'POST' && path === '/reserve') {
        const body = await parseStateBody(request, reserveStorageBody);
        const reservation: StorageReservation = { ...body, state: 'reserved' };
        const next = reserveStorage(state, reservation, Date.now());
        await this.ctx.storage.put('state', next);
        return stateResponse({ reservation: next.reservations[reservation.id] }, 201);
      }
      if (request.method === 'POST' && path === '/settle') {
        const body = await parseStateBody(request, settleStorageBody);
        const next = settleStorage(state, body.id, body.actualBytes, Date.now());
        await this.ctx.storage.put('state', next);
        return stateResponse({ state: next });
      }
      if (request.method === 'POST' && path === '/release') {
        const body = await parseStateBody(request, releaseStorageBody);
        const next = releaseReservation(state, body.id, Date.now());
        await this.ctx.storage.put('state', next);
        return stateResponse({ state: next });
      }
      if (request.method === 'POST' && path === '/adjust') {
        const body = await parseStateBody(request, adjustStorageBody);
        const next = adjustStorage(state, body.id, body.deltaBytes);
        await this.ctx.storage.put('state', next);
        return stateResponse({ state: next });
      }
      return stateResponse({ error: 'not_found' }, 404);
    } catch (error) {
      return stateFailure(error);
    }
  }
}
