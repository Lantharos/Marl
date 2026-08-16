import { DurableObject } from 'cloudflare:workers';
import { StorageError } from './storage-model';
import { attachMultipart, claimPart, completePart, createUploadSession, failPart, markServerUploaded, markUploaded, prepareServerUpload, trackCleanupKey, uploadedParts, type UploadSession } from './upload-model';
import { parseStateBody, stateFailure, stateFetch, stateResponse, trusted, type StateEnv } from './state-http';
import { attachUploadBody, claimPartBody, completePartBody, emptyBody, failPartBody, initializeUploadBody, prepareServerUploadBody, trackCleanupBody } from './state-schemas';

export class UploadSessionObject extends DurableObject<StateEnv> {
  async fetch(request: Request): Promise<Response> {
    if (!trusted(request, this.env)) return stateResponse({ error: 'not_found' }, 404);
    try {
      const path = new URL(request.url).pathname;
      const existing = await this.ctx.storage.get<UploadSession>('session');
      if (request.method === 'GET' && path === '/snapshot') return existing ? stateResponse({ session: existing }) : stateResponse({ error: 'upload_missing' }, 404);
      if (request.method === 'POST' && path === '/initialize') {
        const body = await parseStateBody(request, initializeUploadBody);
        const proposed = createUploadSession(body.pushId, body.repository, body.organizationId, body.expiresAt, body.expectedGeneration, body.refs, body.packs);
        if (existing && JSON.stringify(existing) !== JSON.stringify(proposed)) throw new StorageError('upload_conflict', 'The upload session already exists with different limits.');
        if (!existing) {
          await this.ctx.storage.put('session', proposed);
          await this.ctx.storage.setAlarm(proposed.expiresAt);
        }
        return stateResponse({ session: existing ?? proposed }, 201);
      }
      if (!existing) throw new StorageError('upload_missing', 'The upload session does not exist.');
      if (request.method === 'POST' && path === '/attach') {
        const body = await parseStateBody(request, attachUploadBody);
        const next = attachMultipart(existing, body.pack, body.uploadId);
        await this.ctx.storage.put('session', next);
        return stateResponse({ session: next });
      }
      if (request.method === 'POST' && path === '/claim') {
        const body = await parseStateBody(request, claimPartBody);
        const next = claimPart(existing, body.pack, body.part, body.bytes, Date.now());
        await this.ctx.storage.put('session', next);
        return stateResponse({ session: next });
      }
      if (request.method === 'POST' && path === '/complete-part') {
        const body = await parseStateBody(request, completePartBody);
        const next = completePart(existing, body.pack, body.part, body.etag);
        await this.ctx.storage.put('session', next);
        return stateResponse({ session: next });
      }
      if (request.method === 'POST' && path === '/fail-part') {
        const body = await parseStateBody(request, failPartBody);
        const next = failPart(existing, body.pack, body.part);
        await this.ctx.storage.put('session', next);
        return stateResponse({ session: next });
      }
      if (request.method === 'POST' && path === '/ready') {
        await parseStateBody(request, emptyBody);
        markUploaded(existing, Date.now());
        return stateResponse({ session: existing, packs: existing.packs.map((pack) => ({ ...pack, uploadedParts: uploadedParts(existing, pack.number) })) });
      }
      if (request.method === 'POST' && path === '/uploaded') {
        await parseStateBody(request, emptyBody);
        const next = markUploaded(existing, Date.now());
        await this.ctx.storage.put('session', next);
        return stateResponse({ session: next });
      }
      if (request.method === 'POST' && path === '/prepare-server') {
        const body = await parseStateBody(request, prepareServerUploadBody);
        const next = prepareServerUpload(existing, body.refs, body.packs, Date.now());
        await this.ctx.storage.put('session', next);
        return stateResponse({ session: next });
      }
      if (request.method === 'POST' && path === '/server-uploaded') {
        await parseStateBody(request, emptyBody);
        const next = markServerUploaded(existing, Date.now());
        await this.ctx.storage.put('session', next);
        return stateResponse({ session: next });
      }
      if (request.method === 'POST' && path === '/track') {
        const body = await parseStateBody(request, trackCleanupBody);
        const keys = 'keys' in body ? body.keys : [body.key];
        const next = keys.reduce(trackCleanupKey, existing);
        await this.ctx.storage.put('session', next);
        return stateResponse({ session: next });
      }
      if (request.method === 'POST' && path === '/published') {
        await parseStateBody(request, emptyBody);
        const next = { ...existing, state: 'published' as const };
        await this.ctx.storage.put('session', next);
        await this.ctx.storage.setAlarm(Date.now());
        return stateResponse({ session: next });
      }
      if (request.method === 'POST' && path === '/aborted') {
        await parseStateBody(request, emptyBody);
        const next = { ...existing, state: 'aborted' as const };
        await this.ctx.storage.put('session', next);
        await this.ctx.storage.deleteAlarm();
        return stateResponse({ session: next });
      }
      return stateResponse({ error: 'not_found' }, 404);
    } catch (error) {
      return stateFailure(error);
    }
  }

  async alarm(): Promise<void> {
    const session = await this.ctx.storage.get<UploadSession>('session');
    if (!session || session.state === 'aborted') return;
    if (session.state === 'published') {
      try {
        const acknowledged = await stateFetch(this.env.REPOSITORY_STATE, session.repository, this.env, '/acknowledge', { pushId: session.pushId });
        if (!acknowledged.ok) throw new Error(`Publication acknowledgement failed with ${acknowledged.status}.`);
        await this.ctx.storage.deleteAlarm();
      } catch (error) {
        console.error('publication acknowledgement deferred', error);
        await this.ctx.storage.setAlarm(Date.now() + 60_000);
      }
      return;
    }
    try {
      const committed = await stateFetch(this.env.REPOSITORY_STATE, session.repository, this.env, '/committed', { pushId: session.pushId });
      if (committed.ok) {
        const value = await committed.json<{ committed: { actualBytes: number } }>();
        const settled = await stateFetch(this.env.ORGANIZATION_QUOTAS, session.organizationId, this.env, '/settle', { id: session.pushId, actualBytes: value.committed.actualBytes });
        if (!settled.ok) throw new Error(`Quota settlement failed with ${settled.status}.`);
        await this.ctx.storage.put('session', { ...session, state: 'published' });
        await Promise.allSettled([...session.packs.map((pack) => pack.key), ...session.cleanupKeys.filter((key) => key.startsWith('quarantine/'))].map((key) => this.env.REPOSITORIES.delete(key)));
        const acknowledged = await stateFetch(this.env.REPOSITORY_STATE, session.repository, this.env, '/acknowledge', { pushId: session.pushId });
        if (!acknowledged.ok) throw new Error(`Publication acknowledgement failed with ${acknowledged.status}.`);
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
