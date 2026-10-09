import { describe, expect, test } from 'bun:test';
import { apiWith } from './api';

describe('API response parsing', () => {
  test('accepts successful responses without a body', async () => {
    const noContent = await apiWith<void>(async () => new Response(null, { status: 204 }), '/resource');
    const empty = await apiWith<void>(async () => new Response('', { status: 200 }), '/resource');

    expect(noContent).toBeUndefined();
    expect(empty).toBeUndefined();
  });
});
