import { describe, expect, test } from 'bun:test';
import { rawBlobHeaders } from './raw-content';

describe('raw repository content', () => {
  test('isolates SVG as an attachment instead of active image content', () => {
    const headers = rawBlobHeaders("assets/owner's-mark.SVG", 'public', '412', true);
    expect(headers.get('content-type')).toBe('application/octet-stream');
    expect(headers.get('content-disposition')).toBe("attachment; filename*=UTF-8''owner%27s-mark.SVG");
    expect(headers.get('content-security-policy')).toBe("default-src 'none'; sandbox");
    expect(headers.get('x-content-type-options')).toBe('nosniff');
  });

  test('preserves immutable caching for safe public blob content', () => {
    const headers = rawBlobHeaders('assets/logo.png', 'public', '2048', true);
    expect(headers.get('content-type')).toBe('image/png');
    expect(headers.get('content-disposition')).toBeNull();
    expect(headers.get('content-length')).toBe('2048');
    expect(headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
  });

  test('keeps private blob content out of shared caches', () => {
    const headers = rawBlobHeaders('README.md', 'private', null, false);
    expect(headers.get('content-type')).toBe('text/plain; charset=utf-8');
    expect(headers.get('cache-control')).toBe('private, no-store');
  });
});
