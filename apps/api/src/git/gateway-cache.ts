import type { Env } from '../core/platform';

const cachedFor = 86_400;

export async function cachedGatewayRead(
  env: Env,
  execution: ExecutionContext,
  key: string[],
  read: () => Promise<Response | null>
): Promise<Response | null> {
  const request = new Request(
    `https://gateway-cache.marl.internal/${[env.CF_VERSION_METADATA.id, ...key].map(encodeURIComponent).join('/')}`
  );
  const cached = await caches.default.match(request);
  if (cached) return cached;
  const response = await read();
  if (!response?.ok || !response.body) return response;
  const [body, copy] = response.body.tee();
  const stored = new Response(copy, {
    headers: {
      'content-type': response.headers.get('content-type') ?? 'application/octet-stream',
      'cache-control': `public, max-age=${cachedFor}, immutable`
    }
  });
  execution.waitUntil(caches.default.put(request, stored));
  return new Response(body, response);
}
