import { apiWith } from '$lib/api';
import { routeLoad } from '$lib/load';
import type { PageLoad } from './$types';

type TreeEntry = { name: string; kind: 'blob' | 'tree'; message?: string; updatedAt?: string };

export const load: PageLoad = async ({ fetch, params }) => {
  const query = new URLSearchParams({ revision: params.revision, ...(params.path ? { path: params.path } : {}) });
  const result = await routeLoad(apiWith<{ entries: TreeEntry[] }>(fetch, `/repositories/${params.owner}/${params.repo}/tree?${query}`));
  return { entries: result.entries };
};
