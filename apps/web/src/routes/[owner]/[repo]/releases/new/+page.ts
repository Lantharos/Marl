import type { RepositoryTag } from '@marl/contracts';
import { apiWith } from '#lib/api.js';
import { routeLoad } from '#lib/load.js';
import type { PageLoad } from './$types';

type Branch = { name: string; commitId: string };
export const load = (async ({ fetch, params }) => {
  const [branches, tags] = await Promise.all([
    routeLoad(apiWith<{ branches: Branch[] }>(fetch, `/repositories/${params.owner}/${params.repo}/branches`)),
    routeLoad(apiWith<{ tags: RepositoryTag[] }>(fetch, `/repositories/${params.owner}/${params.repo}/releases/tags`))
  ]);
  return { branches: branches.branches, tags: tags.tags };
}) satisfies PageLoad;
