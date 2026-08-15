import { getContainer } from '@cloudflare/containers';
import { DurableObject } from 'cloudflare:workers';
import type { GitEdgeEnv } from './env';
import { hydrateRepository, indexHydratedRepository } from './hydration';

type IndexTask = { owner: string; repository: string; repositoryId: string; generation: number; attempts: number };

export class RepositoryIndexObject extends DurableObject<GitEdgeEnv> {
  async fetch(request: Request) {
    if (request.headers.get('x-sty-storage-token') !== this.env.STY_GIT_GATEWAY_TOKEN) return new Response(null, { status: 404 });
    const task = await request.json<Omit<IndexTask, 'attempts'>>();
    await this.ctx.storage.put('task', { ...task, attempts: 0 });
    await this.ctx.storage.setAlarm(Date.now());
    return new Response(null, { status: 202 });
  }

  async alarm() {
    const task = await this.ctx.storage.get<IndexTask>('task');
    if (!task) return;
    try {
      const container = getContainer(this.env.GIT_CONTAINERS, `${task.owner}/${task.repository}`);
      await hydrateRepository(container, this.env, task.owner, task.repository);
      await indexHydratedRepository(container, this.env, task.repositoryId, task.owner, task.repository);
      const latest = await this.ctx.storage.get<IndexTask>('task');
      if (latest?.generation === task.generation) await this.ctx.storage.delete('task');
      else await this.ctx.storage.setAlarm(Date.now());
    } catch (error) {
      const attempts = task.attempts + 1;
      console.error('repository indexing failed', error);
      if (attempts >= 3) {
        const latest = await this.ctx.storage.get<IndexTask>('task');
        if (latest?.generation === task.generation) await this.ctx.storage.delete('task');
      } else {
        const latest = await this.ctx.storage.get<IndexTask>('task');
        if (latest && latest.generation !== task.generation) {
          await this.ctx.storage.setAlarm(Date.now());
          return;
        }
        await this.ctx.storage.put('task', { ...task, attempts });
        await this.ctx.storage.setAlarm(Date.now() + 60_000);
      }
    }
  }
}

export async function scheduleRepositoryIndex(env: GitEdgeEnv, owner: string, repository: string, repositoryId: string, generation: number) {
  const stub = env.INDEXING.get(env.INDEXING.idFromName(`${owner}/${repository}`));
  const response = await stub.fetch('http://indexing/schedule', {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-sty-storage-token': env.STY_GIT_GATEWAY_TOKEN },
    body: JSON.stringify({ owner, repository, repositoryId, generation })
  });
  if (!response.ok) throw new Error(`Repository indexing schedule failed with ${response.status}.`);
}
