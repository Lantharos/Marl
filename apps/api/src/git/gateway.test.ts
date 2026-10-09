import { describe, expect, test } from 'bun:test';
import { retryGatewayRequest } from './gateway';

describe('idempotent gateway writes', () => {
  test('retries an operation after its successful response is lost', async () => {
    let attempts = 0;
    const response = await retryGatewayRequest(async () => {
      attempts += 1;
      if (attempts === 1) throw new Error('response lost');
      return Response.json({ commitId: 'a'.repeat(40) });
    }, 2);
    expect(response.ok).toBeTrue();
    expect(attempts).toBe(2);
  });

  test('does not retry a definitive conflict', async () => {
    let attempts = 0;
    const response = await retryGatewayRequest(async () => {
      attempts += 1;
      return Response.json({ error: 'stale branch head' }, { status: 409 });
    }, 2);
    expect(response.status).toBe(409);
    expect(attempts).toBe(1);
  });
});
