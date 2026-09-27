import { apiWith } from '$lib/api';
import { routeLoad } from '$lib/load';
import type { TreeEntry } from '$lib/repositories/browser/types';
import type { PageLoad } from './$types';

export const load = (async ({ fetch, params }) => {
  const query = new URLSearchParams({ revision: params.revision, ...(params.path ? { path: params.path } : {}) });
  const result = await routeLoad(
    apiWith<{ entries: TreeEntry[] }>(fetch, `/repositories/${params.owner}/${params.repo}/tree?${query}`)
  );
  return { entries: result.entries };
}) satisfies PageLoad;
