import type { Principal } from './auth';
import { json } from './http';
import type { Env } from './platform';
import { readBlob } from './repositories';

const previewBytes = 1024 * 1024;

export async function sourcePreview(env: Env, principal: Principal | null, owner: string, repository: string, revision: string, path: string, ctx: ExecutionContext) {
  const response = await readBlob(env, principal, owner, repository, revision, path, ctx);
  if (!response.ok || !response.body) return response;
  const length = response.headers.get('content-length');
  const byteSize = length === null ? null : Number(length);
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  let truncated = false;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      const remaining = previewBytes - size;
      chunks.push(value.subarray(0, remaining));
      size += Math.min(value.length, remaining);
      if (value.length > remaining || size === previewBytes) {
        truncated = byteSize === null || byteSize > size;
        await reader.cancel(); break;
      }
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  let binary = bytes.includes(0);
  let content = '';
  if (!binary) {
    try { content = new TextDecoder('utf-8', { fatal: true }).decode(bytes, { stream: truncated }); }
    catch { binary = true; }
  }
  if (truncated && content.includes('\n')) content = content.slice(0, content.lastIndexOf('\n'));
  return json({ content, byteSize, truncated, binary, contentType: response.headers.get('content-type') ?? 'application/octet-stream' });
}
