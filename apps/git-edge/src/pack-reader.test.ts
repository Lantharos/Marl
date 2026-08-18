import { describe, expect, test } from 'bun:test';
import { readPackedObject } from './pack-reader';

describe('R2 Git pack reader', () => {
  test('inflates ordinary objects and applies reference deltas', async () => {
    const baseId = '11'.repeat(20);
    const deltaId = '22'.repeat(20);
    const base = await representation(3, new TextEncoder().encode('hello'));
    const deltaData = new Uint8Array([5, 6, 0x90, 5, 1, 33]);
    const deltaBody = await deflate(deltaData);
    const delta = concat(new Uint8Array([(7 << 4) | deltaData.length]), hex(baseId), deltaBody);
    const pack = concat(new Uint8Array(12), base, delta);
    const locators = new Map([
      [baseId, { id: baseId, packId: 'aa'.repeat(20), packKey: 'pack', kind: 'blob', size: 5, packedBytes: base.length, offset: 12 }],
      [deltaId, { id: deltaId, packId: 'aa'.repeat(20), packKey: 'pack', kind: 'blob', size: 6, packedBytes: delta.length, offset: 12 + base.length }]
    ]);
    const state = { fetch: async (request: RequestInfo | URL) => {
      const match = new URL(typeof request === 'string' ? request : request instanceof URL ? request.href : request.url).pathname.match(/^\/objects\/([0-9a-f]+)$/);
      const locator = match ? locators.get(match[1]) : null;
      return locator ? Response.json({ locator }) : new Response(null, { status: 404 });
    } };
    const env = {
      MARL_GIT_GATEWAY_TOKEN: 'test',
      REPOSITORY_STATE: { idFromName: () => 'repo', get: () => state },
      REPOSITORIES: { get: async (_key: string, options: { range: { offset: number; length: number } }) => {
        const bytes = pack.slice(options.range.offset, options.range.offset + options.range.length);
        return { arrayBuffer: async () => bytes.buffer };
      } }
    };
    const object = await readPackedObject(env as never, 'repo_test', deltaId);
    expect(object.kind).toBe('blob');
    expect(new TextDecoder().decode(object.bytes)).toBe('hello!');
  });
});

async function representation(type: number, content: Uint8Array) {
  return concat(new Uint8Array([(type << 4) | content.length]), await deflate(content));
}

async function deflate(content: Uint8Array) {
  const stream = new Blob([new Uint8Array(content).buffer]).stream().pipeThrough(new CompressionStream('deflate'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function hex(value: string) {
  return new Uint8Array(value.match(/../g)!.map((byte) => Number.parseInt(byte, 16)));
}

function concat(...values: Uint8Array[]) {
  const output = new Uint8Array(values.reduce((size, value) => size + value.length, 0));
  let offset = 0;
  for (const value of values) { output.set(value, offset); offset += value.length; }
  return output;
}
