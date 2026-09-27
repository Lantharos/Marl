import { apiWith } from '$lib/api';
import { routeLoad } from '$lib/load';
import type { PageLoad } from './$types';

type Branch = { name: string; commitId: string; title: string; updatedAt: string; canDelete: boolean };

export const load = (async ({ fetch, params }) =>
  routeLoad(
    apiWith<{ defaultBranch: string; branches: Branch[] }>(
      fetch,
      `/repositories/${params.owner}/${params.repo}/branches`
    )
  )) satisfies PageLoad;
