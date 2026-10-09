import { MarlApiError } from '#lib/api.js';
import { routeLoad } from '#lib/load.js';
import { folderReadme, loadFolder } from '#lib/repositories/browser/content-cache.svelte.js';
import type { PageLoad } from './$types';

export const load = (async ({ fetch, params, parent }) => {
  const location = { owner: params.owner, repository: params.repo, revision: '' };
  try {
    const root = await loadFolder(fetch, location, '');
    return { folders: { '': root }, readme: folderReadme(fetch, location, root) };
  } catch (cause) {
    if (cause instanceof MarlApiError && cause.code === 'revision_not_found' && !(await parent()).branches.length)
      return { folders: null, readme: null };
    return routeLoad<never>(Promise.reject(cause));
  }
}) satisfies PageLoad;
