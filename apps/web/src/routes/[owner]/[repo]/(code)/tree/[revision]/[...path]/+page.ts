import { routeLoad } from '#lib/load.js';
import { loadFolderChain } from '#lib/repositories/browser/content-cache.svelte.js';
import type { PageLoad } from './$types';

export const load = (async ({ fetch, params }) => {
  const location = { owner: params.owner, repository: params.repo, revision: params.revision };
  const folders = await routeLoad(loadFolderChain(fetch, location, params.path));
  return { folders };
}) satisfies PageLoad;
