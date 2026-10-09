import { apiWith } from '#lib/api.js';
import { routeLoad } from '#lib/load.js';
import type { TreeEntry } from '#lib/repositories/browser/types.js';
import type { PageLoad } from './$types';

export const load = (async ({ fetch, params }) => {
  const query = new URLSearchParams({ revision: params.revision, ...(params.path ? { path: params.path } : {}) });
  const result = await routeLoad(
    apiWith<{ entries: TreeEntry[] }>(fetch, `/repositories/${params.owner}/${params.repo}/tree?${query}`)
  );
  return { entries: result.entries };
}) satisfies PageLoad;
