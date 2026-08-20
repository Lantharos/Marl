import { describe, expect, test } from 'bun:test';
import { formatAbsoluteTime, formatTimestamp } from './time';

describe('UTC timestamps', () => {
  test('treats database timestamps without an offset as UTC', () => {
    expect(formatTimestamp('2026-08-20 12:00:00', new Date('2026-08-20T12:00:20Z'))).toBe('just now');
    expect(formatTimestamp('2026-08-20T12:00:00', new Date('2026-08-20T12:02:00Z'))).toBe('2 minutes ago');
  });

  test('preserves timestamps that already declare an offset', () => {
    expect(formatTimestamp('2026-08-20T14:00:00+02:00', new Date('2026-08-20T12:01:00Z'))).toBe('a minute ago');
    expect(formatAbsoluteTime('invalid')).toBe('Unknown time');
  });
});
