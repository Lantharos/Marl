import { describe, expect, test } from 'bun:test';
import { validIdentitySlug, validSlug } from './names';

describe('names', () => {
  test('accepts familiar repository slugs', () => {
    expect(validSlug('marl')).toBe(true);
    expect(validSlug('marl.sh')).toBe(true);
    expect(validSlug('marl-social.png')).toBe(true);
    expect(validSlug('runner-service_v2')).toBe(true);
  });

  test('rejects reserved identity slugs and malformed slugs', () => {
    for (const value of ['api', 'inbox', 'issues', 'pulls', 'robots.txt', 'marl-social.png'])
      expect(validIdentitySlug(value)).toBe(false);
    for (const value of ['-marl', 'marl-', 'a/b', '', '../marl']) expect(validSlug(value)).toBe(false);
  });
});
