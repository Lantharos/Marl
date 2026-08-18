import { describe, expect, test } from 'bun:test';
import { pageResult, readCursor } from './cursor';

describe('collection cursors', () => {
  test('round-trips the last row without exposing query details', () => {
    const page = pageResult([{ id: 'b', updatedAt: '2026-08-17T09:00:00Z' }, { id: 'a', updatedAt: '2026-08-17T08:00:00Z' }], 1, (row) => ({ value: row.updatedAt, id: row.id }));
    const url = new URL(`https://marl.sh/api?cursor=${page.nextCursor}`);
    expect(readCursor(url)).toEqual({ value: '2026-08-17T09:00:00Z', id: 'b' });
  });
});
