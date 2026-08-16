import type { ApiError } from '@sty/contracts';
import { safeParse, type BaseIssue, type BaseSchema, type InferOutput } from 'valibot';

export function json(value: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set('content-type', 'application/json; charset=utf-8');
  headers.set('cache-control', 'no-store');
  return new Response(JSON.stringify(value), { ...init, headers });
}

export function problem(status: number, code: string, message: string, details?: Record<string, unknown>): Response {
  return json({ error: { code, message, ...(details ? { details } : {}) } } satisfies ApiError, { status });
}

export async function readJson<TSchema extends BaseSchema<unknown, unknown, BaseIssue<unknown>>>(request: Request, schema: TSchema): Promise<InferOutput<TSchema> | null> {
  if (!request.headers.get('content-type')?.toLowerCase().includes('application/json')) return null;
  const declaredSize = Number(request.headers.get('content-length') ?? 0);
  if (Number.isFinite(declaredSize) && declaredSize > 1024 * 1024) return null;
  try {
    const text = await request.text();
    if (text.length > 1024 * 1024) return null;
    const result = safeParse(schema, JSON.parse(text) as unknown);
    return result.success ? result.output as InferOutput<TSchema> : null;
  } catch {
    return null;
  }
}
