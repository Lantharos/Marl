import type { ApiError } from '@marl/contracts';
import { safeParse, type BaseIssue, type BaseSchema, type InferOutput } from 'valibot';

const jsonBodyBytes = 1024 * 1024;

type BodyMessage = {
  body: ReadableStream<Uint8Array> | null;
  headers: Headers;
};

export function json(value: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set('content-type', 'application/json; charset=utf-8');
  headers.set('cache-control', 'no-store');
  headers.set('x-content-type-options', 'nosniff');
  return new Response(JSON.stringify(value), { ...init, headers });
}

export function problem(status: number, code: string, message: string, details?: Record<string, unknown>): Response {
  return json({ error: { code, message, ...(details ? { details } : {}) } } satisfies ApiError, { status });
}

export async function readJson<TSchema extends BaseSchema<unknown, unknown, BaseIssue<unknown>>>(request: Request, schema: TSchema): Promise<InferOutput<TSchema> | null> {
  if (!request.headers.get('content-type')?.toLowerCase().includes('application/json')) return null;
  const value = await readJsonValue(request, jsonBodyBytes);
  const result = safeParse(schema, value);
  return result.success ? result.output as InferOutput<TSchema> : null;
}

export async function readJsonValue<T = unknown>(message: BodyMessage, maxBytes: number): Promise<T | null> {
  const bytes = await readBody(message, maxBytes);
  if (!bytes) return null;
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as T;
  } catch {
    return null;
  }
}

export async function readBody(message: BodyMessage, maxBytes: number): Promise<Uint8Array | null> {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 0) throw new RangeError('Body limit must be a non-negative safe integer.');
  const declared = message.headers.get('content-length');
  if (declared !== null) {
    if (!/^\d+$/.test(declared)) return null;
    const declaredBytes = Number(declared);
    if (!Number.isSafeInteger(declaredBytes) || declaredBytes < 0 || declaredBytes > maxBytes) return null;
  }
  if (!message.body) return new Uint8Array();

  const reader = message.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value.byteLength > maxBytes - total) {
        await reader.cancel().catch(() => undefined);
        return null;
      }
      chunks.push(value);
      total += value.byteLength;
    }
  } finally {
    reader.releaseLock();
  }

  if (chunks.length === 1) return chunks[0];
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}
