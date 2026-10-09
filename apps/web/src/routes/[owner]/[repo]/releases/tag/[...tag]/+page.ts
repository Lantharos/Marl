import type { ReleaseDetail } from '@marl/contracts';
import { apiWith } from '#lib/api.js';
import { routeLoad } from '#lib/load.js';
import type { PageLoad } from './$types';

export const load = (async ({ fetch, params }) => {
  return routeLoad(
    apiWith<{ release: ReleaseDetail }>(
      fetch,
      `/repositories/${params.owner}/${params.repo}/releases/by-tag?tag=${encodeURIComponent(params.tag)}`
    )
  );
}) satisfies PageLoad;
