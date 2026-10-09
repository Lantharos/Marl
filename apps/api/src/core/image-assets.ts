import { problem, readBody } from '../http/http';
import type { Env } from './platform';

const imageBytes = 2 * 1024 * 1024;

const imageTypes = new Map([
  ['image/png', 'png'],
  ['image/jpeg', 'jpg'],
  ['image/webp', 'webp']
]);

export async function readImageUpload(request: Request) {
  const contentType = request.headers.get('content-type')?.split(';')[0].toLowerCase() ?? '';
  const extension = imageTypes.get(contentType);
  if (!extension) return null;
  const bytes = await readBody(request, imageBytes);
  if (!bytes?.length || !matchesImageSignature(contentType, bytes)) return null;
  return { bytes, contentType, extension, version: crypto.randomUUID().replaceAll('-', '') };
}

export async function readImageAsset(env: Env, execution: ExecutionContext, key: string) {
  const cacheKey = new Request(`https://image-cache.marl.internal/${key}`);
  const cached = await caches.default.match(cacheKey);
  if (cached) return imageResponse(cached.body, cached.headers.get('content-type'), cached.headers.get('etag'));
  const object = await env.OBJECTS.get(key);
  if (!object) return problem(404, 'avatar_not_found', 'Avatar not found.');
  const contentType = object.httpMetadata?.contentType ?? 'application/octet-stream';
  const [body, copy] = object.body.tee();
  execution.waitUntil(
    caches.default.put(
      cacheKey,
      new Response(copy, {
        headers: { 'content-type': contentType, etag: object.httpEtag, 'cache-control': 'public, max-age=86400' }
      })
    )
  );
  return imageResponse(body, contentType, object.httpEtag);
}

function imageResponse(body: ReadableStream | null, contentType: string | null, etag: string | null) {
  const headers = new Headers({
    'content-type': contentType ?? 'application/octet-stream',
    'cache-control': 'public, max-age=31536000, immutable',
    'x-content-type-options': 'nosniff'
  });
  if (etag) headers.set('etag', etag);
  return new Response(body, { headers });
}

export function storedImageKey(value: string, prefix: string, id: string) {
  const match = value.match(new RegExp(`^/api/v1/${prefix}/${id}/([a-f0-9]{32}\\.(?:png|jpg|webp))$`));
  return match ? `${prefix}/${id}/${match[1]}` : null;
}

function matchesImageSignature(contentType: string, bytes: Uint8Array) {
  if (contentType === 'image/png')
    return bytes.length >= 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => bytes[index] === byte);
  if (contentType === 'image/jpeg')
    return bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  return (
    bytes.length >= 12 &&
    new TextDecoder().decode(bytes.slice(0, 4)) === 'RIFF' &&
    new TextDecoder().decode(bytes.slice(8, 12)) === 'WEBP'
  );
}
