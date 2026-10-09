import { apiWith } from '#lib/api.js';
import { routeLoad } from '#lib/load.js';
import type { PageLoad } from './$types';

export const load = (({ fetch, params }) =>
  routeLoad(
    apiWith<{ secrets: Array<{ id: string; name: string; createdAt: string; updatedAt: string }> }>(
      fetch,
      `/repositories/${params.owner}/${params.repo}/secrets`
    )
  )) satisfies PageLoad;
