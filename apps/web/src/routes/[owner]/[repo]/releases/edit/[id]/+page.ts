import type { ReleaseDetail, RepositoryTag } from '@marl/contracts';
import { apiWith } from '$lib/api';
import { routeLoad } from '$lib/load';
import type { PageLoad } from './$types';

type Branch = { name: string; commitId: string };
export const load: PageLoad = async ({ fetch, params }) => {
  const [release, branches, tags] = await Promise.all([routeLoad(apiWith<{ release: ReleaseDetail }>(fetch, `/repositories/${params.owner}/${params.repo}/releases/${params.id}`)), routeLoad(apiWith<{ branches: Branch[] }>(fetch, `/repositories/${params.owner}/${params.repo}/branches`)), routeLoad(apiWith<{ tags: RepositoryTag[] }>(fetch, `/repositories/${params.owner}/${params.repo}/releases/tags`))]);
  return {
    release: release.release,
    branches: branches.branches,
    tags: tags.tags
  };
};
