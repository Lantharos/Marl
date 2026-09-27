import { describe, expect, test } from 'bun:test';
import { object, string } from 'valibot';
import { readBody, readJson } from './http';

describe('bounded request bodies', () => {
  test('accepts a streamed body at the byte limit', async () => {
    const request = streamedRequest([new Uint8Array([1, 2]), new Uint8Array([3, 4])]);
    expect(await readBody(request, 4)).toEqual(new Uint8Array([1, 2, 3, 4]));
  });

  test('cancels a streamed body as soon as it crosses the byte limit', async () => {
    let canceled = false;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array([1, 2, 3]));
        controller.enqueue(new Uint8Array([4, 5]));
      },
      cancel() { canceled = true; }
    });
    const request = new Request('https://marl.test/upload', { method: 'POST', body });
    expect(await readBody(request, 4)).toBeNull();
    expect(canceled).toBe(true);
  });

  test('measures JSON in bytes and validates it after bounded streaming', async () => {
    const schema = object({ value: string() });
    const request = new Request('https://marl.test/json', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ value: '✓' })
    });
    expect(await readJson(request, schema)).toEqual({ value: '✓' });
  });

  test('rejects malformed or oversized declared lengths before reading', async () => {
    for (const length of ['1e3', '-1', '5']) {
      const request = new Request('https://marl.test/upload', {
        method: 'POST',
        headers: { 'content-length': length },
        body: new ReadableStream<Uint8Array>()
      });
      expect(await readBody(request, 4)).toBeNull();
      expect(request.bodyUsed).toBe(false);
    }
  });

  test('measures the stream when Content-Length understates the body', async () => {
    const request = new Request('https://marl.test/upload', {
      method: 'POST',
      headers: { 'content-length': '1' },
      body: new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new Uint8Array([1, 2, 3, 4]));
          controller.close();
        }
      })
    });
    expect(await readBody(request, 4)).toEqual(new Uint8Array([1, 2, 3, 4]));
  });
});

function streamedRequest(chunks: Uint8Array[]) {
  return new Request('https://marl.test/upload', {
    method: 'POST',
    body: new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(chunk);
        controller.close();
      }
    })
  });
}
