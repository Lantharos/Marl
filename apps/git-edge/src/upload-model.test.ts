import { describe, expect, test } from 'bun:test';
import { STORAGE_LIMITS } from './storage-model';
import { attachMultipart, claimPart, completePart, createUploadSession, markUploaded, uploadedParts } from './upload-model';

const now = Date.now();

describe('bounded multipart sessions', () => {
  test('requires exact fixed-size parts and completes in order', () => {
    let session = createUploadSession('push_1234567890abcdef', 'lantharos/marl', 'org_1', now + 60_000, 0, { 'refs/heads/main': 'a'.repeat(40) }, [{ bytes: STORAGE_LIMITS.partBytes + 7, parts: 2, key: 'packs/one.pack' }]);
    session = attachMultipart(session, 0, 'r2-upload');
    session = claimPart(session, 0, 1, STORAGE_LIMITS.partBytes, now);
    session = completePart(session, 0, 1, 'etag-one');
    session = claimPart(session, 0, 2, 7, now);
    session = completePart(session, 0, 2, 'etag-two');
    expect(uploadedParts(session, 0)).toEqual([{ partNumber: 1, etag: 'etag-one' }, { partNumber: 2, etag: 'etag-two' }]);
    expect(markUploaded(session, now).state).toBe('uploaded');
  });

  test('rejects a part whose body would exceed the reservation', () => {
    let session = createUploadSession('push_1234567890abcdef', 'lantharos/marl', 'org_1', now + 60_000, 0, {}, [{ bytes: 12, parts: 1, key: 'packs/one.pack' }]);
    session = attachMultipart(session, 0, 'r2-upload');
    expect(() => claimPart(session, 0, 1, 13, now)).toThrow();
  });
});
