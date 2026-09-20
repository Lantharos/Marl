import type { GitEdgeEnv } from './env';
import { readBoundedJson } from './bounded-body';
import { organizationQuota, repositoryState } from './state-client';

export async function purgeRepository(request: Request, env: GitEdgeEnv) {
  const body = await readBoundedJson<{ repositoryId: string; organizationId: string }>(request, 4096);
  if (!body || !/^[a-zA-Z0-9_-]+$/.test(body.repositoryId) || !/^[a-zA-Z0-9_-]+$/.test(body.organizationId)) return new Response(null, { status: 422 });
  const state = repositoryState(env, body.repositoryId);
  const deletion = await state.request<{ storedBytes: number; startedAt: number; complete?: boolean }>('/delete', {});
  if (deletion.complete) return new Response(null, { status: 204 });
  if (Date.now() - deletion.startedAt < 3_600_000) return new Response(null, { status: 202 });
  const objects = await env.REPOSITORIES.list({ prefix: `repositories/${body.repositoryId}/`, limit: 500 });
  if (objects.objects.length) {
    await env.REPOSITORIES.delete(objects.objects.map(object => object.key));
    return new Response(null, { status: 202 });
  }
  await organizationQuota(env, body.organizationId).request('/adjust', { id: `repository-delete-${body.repositoryId}`, deltaBytes: -deletion.storedBytes });
  await state.request('/delete/complete', {});
  return new Response(null, { status: 204 });
}
