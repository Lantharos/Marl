import { describe, expect, test } from 'bun:test';
import { validTotp } from './step-up';

describe('authenticator step-up', () => {
  test('accepts the RFC TOTP value within its time window', async () => {
    const secret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
    expect(await validTotp(secret, '287082', 59_000)).toBe(true);
    expect(await validTotp(secret, '287083', 59_000)).toBe(false);
  });
});
