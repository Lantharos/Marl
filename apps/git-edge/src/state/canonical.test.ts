import { describe, expect, test } from 'bun:test';
import { promoteCanonicalObject } from './canonical';

describe('canonical object promotion', () => {
  test('recovers when R2 stores the object but loses the response', async () => {
    const objects = new Map<string, Uint8Array>([['quarantine/repo/push/0.pack', new Uint8Array([1, 2, 3])]]);
    let failed = false;
    const bucket = {
      head: async (key: string) => objects.has(key) ? { size: objects.get(key)!.byteLength } : null,
      get: async (key: string) => objects.has(key) ? { body: new Blob([objects.get(key)!]).stream() } : null,
      put: async (key: string, body: ReadableStream) => {
        objects.set(key, new Uint8Array(await new Response(body).arrayBuffer()));
        if (!failed) {
          failed = true;
          throw new Error('response lost');
        }
      }
    } as unknown as R2Bucket;

    expect(await promoteCanonicalObject(bucket, 'quarantine/repo/push/0.pack', 'repositories/repo/packs/abc.pack', 3, 'application/x-git-packed-objects')).toBe(true);
    expect(objects.get('repositories/repo/packs/abc.pack')).toEqual(new Uint8Array([1, 2, 3]));
  });

  test('refuses to reuse a truncated canonical object', async () => {
    const bucket = { head: async () => ({ size: 2 }) } as unknown as R2Bucket;
    await expect(promoteCanonicalObject(bucket, 'quarantine/repo/push/0.pack', 'repositories/repo/packs/abc.pack', 3, 'application/x-git-packed-objects')).rejects.toThrow('unexpected size');
  });
});
