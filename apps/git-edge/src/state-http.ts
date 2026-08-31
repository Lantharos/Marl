import { readBoundedJson } from './bounded-body';
import { StorageError } from './storage-model';
import { safeParse, type BaseIssue, type BaseSchema, type InferOutput } from 'valibot';

export interface StateEnv {
  MARL_GIT_GATEWAY_TOKEN: string;
  REPOSITORY_STATE: DurableObjectNamespace;
  ORGANIZATION_QUOTAS: DurableObjectNamespace;
  REPOSITORIES: R2Bucket;
}

export function stateFetch(namespace: DurableObjectNamespace, name: string, env: StateEnv, path: string, body: unknown) {
  const stub = namespace.get(namespace.idFromName(name));
  return stub.fetch(`http://state${path}`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-marl-storage-token': env.MARL_GIT_GATEWAY_TOKEN }, body: JSON.stringify(body) });
}

export function trusted(request: Request, env: StateEnv) {
  return Boolean(env.MARL_GIT_GATEWAY_TOKEN) && request.headers.get('x-marl-storage-token') === env.MARL_GIT_GATEWAY_TOKEN;
}

export async function parseStateBody<TSchema extends BaseSchema<unknown, unknown, BaseIssue<unknown>>>(request: Request, schema: TSchema): Promise<InferOutput<TSchema>> {
  if (!request.headers.get('content-type')?.toLowerCase().includes('application/json')) throw new StorageError('invalid_request', 'A JSON request body is required.');
  const result = safeParse(schema, await readBoundedJson<unknown>(request, 1024 * 1024));
  if (!result.success) throw new StorageError('invalid_request', 'The request body is invalid or too large.');
  return result.output as InferOutput<TSchema>;
}

export function stateFailure(error: unknown) {
  return error instanceof StorageError ? stateResponse({ error: error.code, detail: error.message }, 409) : stateResponse({ error: 'storage_state_failed', detail: error instanceof Error ? error.message : 'Storage state failed.' }, 500);
}

export function stateResponse(value: unknown, status = 200) {
  return Response.json(value, { status });
}
