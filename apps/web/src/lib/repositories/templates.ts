import type { RepositoryTemplates } from '@marl/contracts';
import { api } from '$lib/api';

const cache = new Map<string, Promise<RepositoryTemplates>>();

export function repositoryTemplate(repository: string, kind: keyof RepositoryTemplates) {
  let templates = cache.get(repository);
  if (!templates) {
    templates = api<RepositoryTemplates>(`/repositories/${repository}/templates`).catch(() => {
      cache.delete(repository);
      return { pull: null, issue: null };
    });
    cache.set(repository, templates);
  }
  return templates.then((value) => value[kind]);
}
