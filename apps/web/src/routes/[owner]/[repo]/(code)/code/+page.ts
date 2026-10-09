import { apiWith, MarlApiError } from '#lib/api.js';
import { routeLoad } from '#lib/load.js';
import type { Tree } from '#lib/repositories/browser/types.js';
import type { PageLoad } from './$types';

export const load = (async ({ fetch, params, parent }) => {
  try {
    return { tree: await apiWith<Tree>(fetch, `/repositories/${params.owner}/${params.repo}/tree`) };
  } catch (cause) {
    if (cause instanceof MarlApiError && cause.code === 'revision_not_found' && !(await parent()).branches.length)
      return { tree: null };
    return routeLoad<never>(Promise.reject(cause));
  }
}) satisfies PageLoad;
