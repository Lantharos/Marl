import { STORAGE_LIMITS, StorageError } from './storage-model';

export type PlannedPack = {
  number: number;
  bytes: number;
  parts: number;
  key: string;
  multipartUploadId: string | null;
};

export type UploadedPart = {
  pack: number;
  part: number;
  bytes: number;
  etag?: string;
  attempts: number;
  state: 'uploading' | 'uploaded' | 'failed';
};

export type UploadSession = {
  pushId: string;
  repository: string;
  organizationId: string;
  expiresAt: number;
  expectedGeneration: number;
  refs: Record<string, string>;
  packs: PlannedPack[];
  parts: Record<string, UploadedPart>;
  cleanupKeys: string[];
  state: 'uploading' | 'uploaded' | 'validating' | 'published' | 'aborted';
};

export function createUploadSession(pushId: string, repository: string, organizationId: string, expiresAt: number, expectedGeneration: number, refs: Record<string, string>, input: Array<{ bytes: number; parts: number; key: string }>): UploadSession {
  if (!/^push_[a-z0-9]{16,64}$/.test(pushId) || !repository || !organizationId || expiresAt <= Date.now()) throw new StorageError('invalid_upload', 'The upload session is invalid.');
  if (input.length > 4) throw new StorageError('invalid_upload', 'A push may contain up to four packs.');
  const packs = plannedPacks(input);
  if (packs.reduce((total, pack) => total + pack.bytes, 0) > STORAGE_LIMITS.pushBytes) throw new StorageError('push_too_large', 'The push exceeds the compressed upload limit.');
  return { pushId, repository, organizationId, expiresAt, expectedGeneration, refs, packs, parts: {}, cleanupKeys: [], state: 'uploading' };
}

export function trackCleanupKey(session: UploadSession, key: string): UploadSession {
  if (!key.startsWith(`repositories/${session.repository}/`) || session.state === 'published' || session.state === 'aborted') throw new StorageError('invalid_cleanup_key', 'The cleanup key does not belong to this upload.');
  return session.cleanupKeys.includes(key) ? session : { ...session, cleanupKeys: [...session.cleanupKeys, key] };
}

export function prepareServerUpload(session: UploadSession, refs: Record<string, string>, input: Array<{ bytes: number; parts: number; key: string }>, now: number): UploadSession {
  ensureWritable(session, now);
  if (session.packs.length || Object.keys(session.parts).length) throw new StorageError('upload_conflict', 'The server upload was already prepared.');
  const packs = plannedPacks(input);
  if (packs.reduce((total, pack) => total + pack.bytes, 0) > STORAGE_LIMITS.pushBytes) throw new StorageError('push_too_large', 'The push exceeds the compressed upload limit.');
  return { ...session, refs, packs };
}

export function markServerUploaded(session: UploadSession, now: number): UploadSession {
  ensureWritable(session, now);
  if (session.packs.some((pack) => pack.multipartUploadId)) throw new StorageError('upload_conflict', 'Multipart packs cannot use server completion.');
  return { ...session, state: 'uploaded' };
}

function plannedPacks(input: Array<{ bytes: number; parts: number; key: string }>) {
  return input.map((pack, number) => {
    if (!Number.isSafeInteger(pack.bytes) || pack.bytes < 1 || !Number.isSafeInteger(pack.parts) || pack.parts < 1 || pack.parts > STORAGE_LIMITS.partsPerPack || pack.parts !== Math.ceil(pack.bytes / STORAGE_LIMITS.partBytes)) throw new StorageError('invalid_upload', 'Pack size and part count do not agree.');
    return { ...pack, number, multipartUploadId: null };
  });
}

export function attachMultipart(session: UploadSession, packNumber: number, uploadId: string): UploadSession {
  const pack = session.packs[packNumber];
  if (!pack || !uploadId) throw new StorageError('invalid_upload', 'The multipart upload does not match this push.');
  if (pack.multipartUploadId && pack.multipartUploadId !== uploadId) throw new StorageError('upload_conflict', 'The pack already has a different multipart upload.');
  return { ...session, packs: session.packs.map((value) => value.number === packNumber ? { ...value, multipartUploadId: uploadId } : value) };
}

export function claimPart(session: UploadSession, packNumber: number, partNumber: number, bytes: number, now: number): UploadSession {
  ensureWritable(session, now);
  const pack = session.packs[packNumber];
  if (!pack?.multipartUploadId || !Number.isInteger(partNumber) || partNumber < 1 || partNumber > pack.parts) throw new StorageError('invalid_part', 'The upload part is invalid.');
  const expectedBytes = partNumber === pack.parts ? pack.bytes - STORAGE_LIMITS.partBytes * (pack.parts - 1) : STORAGE_LIMITS.partBytes;
  if (bytes !== expectedBytes) throw new StorageError('invalid_part_size', `Part ${partNumber} must contain exactly ${expectedBytes} bytes.`);
  const key = partKey(packNumber, partNumber);
  const current = session.parts[key];
  if (current?.state === 'uploaded' || current?.state === 'uploading') throw new StorageError('part_already_claimed', 'The upload part has already been claimed.');
  const attempts = (current?.attempts ?? 0) + 1;
  if (attempts > STORAGE_LIMITS.uploadAttemptsPerPart) throw new StorageError('part_retry_limit', 'The upload part exceeded its retry limit.');
  return { ...session, parts: { ...session.parts, [key]: { pack: packNumber, part: partNumber, bytes, attempts, state: 'uploading' } } };
}

export function completePart(session: UploadSession, packNumber: number, partNumber: number, etag: string): UploadSession {
  const key = partKey(packNumber, partNumber);
  const current = session.parts[key];
  if (!current || current.state !== 'uploading' || !etag) throw new StorageError('part_not_claimed', 'The upload part is not currently claimed.');
  return { ...session, parts: { ...session.parts, [key]: { ...current, state: 'uploaded', etag } } };
}

export function failPart(session: UploadSession, packNumber: number, partNumber: number): UploadSession {
  const key = partKey(packNumber, partNumber);
  const current = session.parts[key];
  if (!current || current.state !== 'uploading') return session;
  return { ...session, parts: { ...session.parts, [key]: { ...current, state: 'failed' } } };
}

export function markUploaded(session: UploadSession, now: number): UploadSession {
  ensureWritable(session, now);
  for (const pack of session.packs) {
    for (let part = 1; part <= pack.parts; part += 1) {
      if (session.parts[partKey(pack.number, part)]?.state !== 'uploaded') throw new StorageError('upload_incomplete', 'Every pack part must finish before validation.');
    }
  }
  return { ...session, state: 'uploaded' };
}

export function uploadedParts(session: UploadSession, packNumber: number) {
  const pack = session.packs[packNumber];
  if (!pack) throw new StorageError('invalid_pack', 'The pack does not belong to this push.');
  return Array.from({ length: pack.parts }, (_, index) => {
    const value = session.parts[partKey(packNumber, index + 1)];
    if (!value?.etag) throw new StorageError('upload_incomplete', 'Every uploaded part needs an R2 etag.');
    return { partNumber: value.part, etag: value.etag };
  });
}

function ensureWritable(session: UploadSession, now: number) {
  if (session.expiresAt <= now) throw new StorageError('upload_expired', 'The upload session expired.');
  if (session.state !== 'uploading') throw new StorageError('upload_closed', 'The upload session no longer accepts parts.');
}

function partKey(pack: number, part: number) {
  return `${pack}:${part}`;
}
