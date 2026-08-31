import { describe, expect, test } from 'bun:test';
import { apiTextCursorAllWith, apiWith } from './api';

describe('API response parsing', () => {
  test('accepts successful responses without a body', async () => {
    const noContent = await apiWith<void>(async () => new Response(null, { status: 204 }), '/resource');
    const empty = await apiWith<void>(async () => new Response('', { status: 200 }), '/resource');

    expect(noContent).toBeUndefined();
    expect(empty).toBeUndefined();
  });

  test('still parses successful JSON responses', async () => {
    const value = await apiWith<{ ok: boolean }>(async () => Response.json({ ok: true }), '/resource');
    expect(value).toEqual({ ok: true });
  });

  test('reads every paginated log segment', async () => {
    const requested: number[] = [];
    const result = await apiTextCursorAllWith(async (input) => {
      const after = Number(new URL(String(input), 'https://marl.test').searchParams.get('after'));
      requested.push(after);
      return new Response(after < 0 ? 'first\n' : 'second\n', {
        headers: {
          'x-marl-log-cursor': after < 0 ? '3' : '5',
          'x-marl-log-more': after < 0 ? 'true' : 'false'
        }
      });
    }, '/jobs/job_1/logs');

    expect(requested).toEqual([-1, 3]);
    expect(result).toEqual({ text: 'first\nsecond\n', cursor: 5 });
  });
});
