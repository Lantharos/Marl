import { apiWith } from '#lib/api.js';
import { routeLoad } from '#lib/load.js';
import type { Tree } from '#lib/repositories/browser/types.js';
import type { PageLoad } from './$types';

export const load = (async ({ fetch, params }) => {
  const query = new URLSearchParams({ revision: params.revision, ...(params.path ? { path: params.path } : {}) });
  return { tree: await routeLoad(apiWith<Tree>(fetch, `/repositories/${params.owner}/${params.repo}/tree?${query}`)) };
}) satisfies PageLoad;
