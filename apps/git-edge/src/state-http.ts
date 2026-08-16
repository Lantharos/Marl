import { StorageError } from './storage-model';
import { safeParse, type BaseIssue, type BaseSchema, type InferOutput } from 'valibot';

export interface StateEnv {
  STY_GIT_GATEWAY_TOKEN: string;
  REPOSITORY_STATE: DurableObjectNamespace;
  ORGANIZATION_QUOTAS: DurableObjectNamespace;
  REPOSITORIES: R2Bucket;
}

export function stateFetch(namespace: DurableObjectNamespace, name: string, env: StateEnv, path: string, body: unknown) {
  const stub = namespace.get(namespace.idFromName(name));
  return stub.fetch(`http://state${path}`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-sty-storage-token': env.STY_GIT_GATEWAY_TOKEN }, body: JSON.stringify(body) });
}

export function trusted(request: Request, env: StateEnv) {
  return Boolean(env.STY_GIT_GATEWAY_TOKEN) && request.headers.get('x-sty-storage-token') === env.STY_GIT_GATEWAY_TOKEN;
}

export async function parseStateBody<TSchema extends BaseSchema<unknown, unknown, BaseIssue<unknown>>>(request: Request, schema: TSchema): Promise<InferOutput<TSchema>> {
  if (!request.headers.get('content-type')?.toLowerCase().includes('application/json')) throw new StorageError('invalid_request', 'A JSON request body is required.');
  const declaredSize = Number(request.headers.get('content-length') ?? 0);
  if (Number.isFinite(declaredSize) && declaredSize > 1024 * 1024) throw new StorageError('invalid_request', 'The request body is too large.');
  try {
    const text = await request.text();
    if (text.length > 1024 * 1024) throw new StorageError('invalid_request', 'The request body is too large.');
    const result = safeParse(schema, JSON.parse(text) as unknown);
    if (!result.success) throw new StorageError('invalid_request', 'The request body is invalid.');
    return result.output as InferOutput<TSchema>;
  } catch (error) {
    if (error instanceof StorageError) throw error;
    throw new StorageError('invalid_request', 'The request body is invalid.');
  }
}

export function stateFailure(error: unknown) {
  return error instanceof StorageError ? stateResponse({ error: error.code, detail: error.message }, 409) : stateResponse({ error: 'storage_state_failed', detail: error instanceof Error ? error.message : 'Storage state failed.' }, 500);
}

export function stateResponse(value: unknown, status = 200) {
  return Response.json(value, { status });
}
