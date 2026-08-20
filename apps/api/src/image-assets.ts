import { problem } from './http';
import type { Env } from './platform';

const imageTypes = new Map([
  ['image/png', 'png'],
  ['image/jpeg', 'jpg'],
  ['image/webp', 'webp']
]);

export async function readImageUpload(request: Request) {
  const contentType = request.headers.get('content-type')?.split(';')[0].toLowerCase() ?? '';
  const extension = imageTypes.get(contentType);
  const declaredSize = Number(request.headers.get('content-length') ?? 0);
  if (!extension || (declaredSize && declaredSize > 2 * 1024 * 1024)) return null;
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (!bytes.length || bytes.length > 2 * 1024 * 1024 || !matchesImageSignature(contentType, bytes)) return null;
  return { bytes, contentType, extension, version: crypto.randomUUID().replaceAll('-', '') };
}

export async function readImageAsset(env: Env, key: string) {
  const object = await env.OBJECTS.get(key);
  if (!object) return problem(404, 'avatar_not_found', 'Avatar not found.');
  return new Response(object.body, { headers: { 'content-type': object.httpMetadata?.contentType ?? 'application/octet-stream', 'cache-control': 'public, max-age=31536000, immutable', etag: object.httpEtag, 'x-content-type-options': 'nosniff' } });
}

export function storedImageKey(value: string, prefix: string, id: string) {
  const match = value.match(new RegExp(`^/api/v1/${prefix}/${id}/([a-f0-9]{32}\\.(?:png|jpg|webp))$`));
  return match ? `${prefix}/${id}/${match[1]}` : null;
}

function matchesImageSignature(contentType: string, bytes: Uint8Array) {
  if (contentType === 'image/png') return bytes.length >= 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => bytes[index] === byte);
  if (contentType === 'image/jpeg') return bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  return bytes.length >= 12 && new TextDecoder().decode(bytes.slice(0, 4)) === 'RIFF' && new TextDecoder().decode(bytes.slice(8, 12)) === 'WEBP';
}
