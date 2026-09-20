import type { Principal } from './auth';
import { identifier } from './domain';
import { json, problem } from './http';
import type { Env } from './platform';
import { authorizeRepository } from './repository-access';

const imageLimit = 10 * 1024 * 1024;
const videoLimit = 50 * 1024 * 1024;
const types = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'video/mp4', 'video/webm']);
type MediaRow = { id: string; objectKey: string; name: string; contentType: string; size: number; owner: string; repository: string };

export async function uploadRepositoryMedia(request: Request, env: Env, principal: Principal, owner: string, name: string) {
  const repository = await authorizeRepository(env, principal, owner, name, 'repository.read');
  if (!repository) return problem(404, 'repository_not_found', 'Repository not found.');
  if (repository.archivedAt) return problem(409, 'repository_archived', 'Archived repositories cannot accept attachments.');
  const contentType = request.headers.get('content-type')?.toLowerCase() ?? '';
  const size = Number(request.headers.get('x-media-size'));
  const limit = contentType.startsWith('video/') ? videoLimit : imageLimit;
  if (!types.has(contentType)) return problem(415, 'unsupported_media', 'Attach a PNG, JPEG, GIF, WebP, MP4, or WebM file.');
  if (!Number.isSafeInteger(size) || size < 16 || size > limit || !request.body) return problem(413, 'media_too_large', `Attachments can be up to ${limit / 1024 / 1024} MB.`);
  if (request.headers.has('content-length') && Number(request.headers.get('content-length')) !== size) return problem(400, 'invalid_media_size', 'Attachment size does not match its content.');
  const filename = (new URL(request.url).searchParams.get('name') ?? 'attachment').replace(/[\x00-\x1f\x7f/\\]/g, '').trim().slice(0, 180) || 'attachment';
  const id = identifier('media');
  const objectKey = `repositories/${repository.id}/media/${id}`;
  const reserved = await env.DB.prepare('INSERT INTO repository_media (id,repository_id,author_id,object_key,name,content_type,size,created_at) SELECT ?,?,?,?,?,?,?,? WHERE (SELECT COALESCE(SUM(size),0) FROM repository_media WHERE author_id=? AND created_at>?) + ? <= ?').bind(id, repository.id, principal.id, objectKey, filename, contentType, size, new Date().toISOString(), principal.id, new Date(Date.now() - 86_400_000).toISOString(), size, 250 * 1024 * 1024).run();
  if (!reserved.meta.changes) return problem(429, 'media_quota', 'You have uploaded a lot today. Try again tomorrow.');
  const fixed = new FixedLengthStream(size);
  const transfer = request.body.pipeThrough(validateMedia(contentType, size)).pipeTo(fixed.writable);
  const stored = env.OBJECTS.put(objectKey, fixed.readable, { httpMetadata: { contentType } });
  const results = await Promise.allSettled([transfer, stored]);
  if (results.some((result) => result.status === 'rejected')) {
    await env.OBJECTS.delete(objectKey);
    await env.DB.prepare('DELETE FROM repository_media WHERE id=?').bind(id).run();
    return problem(422, 'invalid_media', 'The upload was interrupted or the file does not match its image or video format.');
  }
  return json({ media: { id, url: `/api/v1/media/${id}`, name: filename, contentType, size } }, { status: 201 });
}

export async function readRepositoryMedia(request: Request, env: Env, principal: Principal | null, id: string) {
  const media = await env.DB.prepare('SELECT repository_media.id,repository_media.object_key AS objectKey,repository_media.name,repository_media.content_type AS contentType,repository_media.size,organizations.slug AS owner,repositories.name AS repository FROM repository_media JOIN repositories ON repositories.id=repository_media.repository_id JOIN organizations ON organizations.id=repositories.organization_id WHERE repository_media.id=?').bind(id).first<MediaRow>();
  if (!media || !await authorizeRepository(env, principal, media.owner, media.repository, 'repository.read')) return problem(404, 'media_not_found', 'Attachment not found.');
  const etag = `"${media.id}"`;
  const headers = new Headers({
    'content-type': media.contentType,
    'content-disposition': `inline; filename*=UTF-8''${encodeURIComponent(media.name)}`,
    'cache-control': 'private, no-store',
    'x-content-type-options': 'nosniff',
    'cross-origin-resource-policy': 'same-origin',
    'accept-ranges': 'bytes',
    etag
  });
  const requestedRange = request.headers.get('range');
  const ifRange = request.headers.get('if-range');
  const range = requestedRange && (!ifRange || ifRange === etag) ? byteRange(requestedRange, media.size) : undefined;
  if (range === null) {
    headers.set('content-range', `bytes */${media.size}`);
    return new Response(null, { status: 416, headers });
  }
  headers.set('content-length', String(range?.length ?? media.size));
  if (range) headers.set('content-range', `bytes ${range.offset}-${range.offset + range.length - 1}/${media.size}`);
  if (request.method === 'HEAD') return new Response(null, { status: range ? 206 : 200, headers });
  const object = await env.OBJECTS.get(media.objectKey, range ? { range } : undefined);
  if (!object) return problem(404, 'media_not_found', 'Attachment not found.');
  return new Response(object.body, { status: range ? 206 : 200, headers });
}

function byteRange(header: string, size: number): { offset: number; length: number } | null {
  const match = /^bytes=(\d*)-(\d*)$/.exec(header);
  if (!match || (!match[1] && !match[2])) return null;
  const start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]));
  const end = match[1] && match[2] ? Math.min(size - 1, Number(match[2])) : size - 1;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start >= size || end < start || (!match[1] && Number(match[2]) === 0)) return null;
  return { offset: start, length: end - start + 1 };
}

function validateMedia(contentType: string, size: number) {
  const prefix = new Uint8Array(Math.min(size, 512));
  let received = 0;
  let copied = 0;
  let verified = false;
  return new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      received += chunk.byteLength;
      if (received > size) throw new Error('Attachment exceeds declared size');
      if (!verified) {
        const bytes = Math.min(prefix.length - copied, chunk.length);
        prefix.set(chunk.subarray(0, bytes), copied);
        copied += bytes;
        if (copied === prefix.length) {
          if (!matchesFormat(prefix, contentType)) throw new Error('Attachment format mismatch');
          verified = true;
        }
      }
      controller.enqueue(chunk);
    },
    flush() {
      if (received !== size || !verified) throw new Error('Incomplete attachment');
    }
  });
}

function matchesFormat(bytes: Uint8Array, type: string) {
  const text = (start: number, end: number) => String.fromCharCode(...bytes.subarray(start, end));
  if (type === 'image/png') return [137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => bytes[index] === byte);
  if (type === 'image/jpeg') return bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  if (type === 'image/gif') return ['GIF87a', 'GIF89a'].includes(text(0, 6));
  if (type === 'image/webp') return text(0, 4) === 'RIFF' && text(8, 12) === 'WEBP';
  if (type === 'video/mp4') return text(4, 8) === 'ftyp' && ['isom', 'iso2', 'mp41', 'mp42', 'avc1', 'M4V ', 'dash'].some((brand) => text(8, Math.min(bytes.length, 64)).includes(brand));
  return type === 'video/webm' && [26, 69, 223, 163].every((byte, index) => bytes[index] === byte) && text(0, bytes.length).includes('webm');
}
