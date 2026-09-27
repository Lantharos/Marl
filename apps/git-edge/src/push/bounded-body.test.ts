import { describe, expect, test } from 'bun:test';
import { readBoundedBody, readBoundedJson } from './bounded-body';

describe('bounded bodies', () => {
  test('accepts the exact byte limit and rejects the next byte', async () => {
    const accepted = await readBoundedBody(new Blob(['12345']).stream(), 5);
    expect(new TextDecoder().decode(accepted!)).toBe('12345');
    expect(await readBoundedBody(new Blob(['123456']).stream(), 5)).toBeNull();
  });

  test('rejects oversized and invalid JSON before consumers use it', async () => {
    const oversized = new Request('https://state.invalid/catalog', {
      method: 'POST',
      headers: { 'content-length': '9' },
      body: '{}'
    });
    expect(await readBoundedJson(oversized, 8)).toBeNull();

    const invalid = new Request('https://state.invalid/catalog', { method: 'POST', body: '{' });
    expect(await readBoundedJson(invalid, 8)).toBeNull();
  });
});
