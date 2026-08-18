import { getContainer } from '@cloudflare/containers';
import { DurableObject } from 'cloudflare:workers';
import { beginOperation, completeOperation, operationResponse, readOperation, retryOperation, scheduleOperation } from './durable-operation';
import type { GitEdgeEnv } from './env';
import { hydrateRepository, indexHydratedRepository } from './hydration';
import { parseStateBody, stateFailure } from './state-http';
import { repositoryIndexTaskBody } from './state-schemas';

type IndexTask = { owner: string; repository: string; repositoryId: string; generation: number };

export class RepositoryIndexObject extends DurableObject<GitEdgeEnv> {
  async fetch(request: Request) {
    if (request.headers.get('x-marl-storage-token') !== this.env.MARL_GIT_GATEWAY_TOKEN) return new Response(null, { status: 404 });
    if (request.method === 'GET' && new URL(request.url).pathname === '/status') return operationResponse(await readOperation(this.ctx.storage));
    try {
      const task = await parseStateBody(request, repositoryIndexTaskBody);
      await scheduleOperation(this.ctx.storage, 'repository.index', String(task.generation), task);
      return new Response(null, { status: 202 });
    } catch (error) {
      return stateFailure(error);
    }
  }

  async alarm() {
    const operation = await beginOperation<IndexTask>(this.ctx.storage);
    if (!operation) return;
    const task = operation.payload;
    try {
      const container = getContainer(this.env.GIT_CONTAINERS, task.repositoryId);
      await hydrateRepository(container, this.env, task.owner, task.repository, task.repositoryId);
      const previousHeads = await this.ctx.storage.get<string[]>('indexed-heads') ?? [];
      const indexed = await indexHydratedRepository(container, this.env, task.repositoryId, task.owner, task.repository, task.generation, previousHeads);
      await this.ctx.storage.put('indexed-heads', indexed.heads);
      await completeOperation(this.ctx.storage, operation.id);
    } catch (error) {
      console.error('repository indexing failed', error);
      await retryOperation(this.ctx.storage, operation.id, error, Math.min(60_000 * 2 ** Math.min(operation.attempts - 1, 6), 60 * 60 * 1000));
    }
  }
}

export async function scheduleRepositoryIndex(env: GitEdgeEnv, owner: string, repository: string, repositoryId: string, generation: number) {
  const stub = env.INDEXING.get(env.INDEXING.idFromName(repositoryId));
  const response = await stub.fetch('http://indexing/schedule', {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-marl-storage-token': env.MARL_GIT_GATEWAY_TOKEN },
    body: JSON.stringify({ owner, repository, repositoryId, generation })
  });
  if (!response.ok) throw new Error(`Repository indexing schedule failed with ${response.status}.`);
}
