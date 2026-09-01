import type { ReleaseDetail } from '@marl/contracts';
import { apiWith } from '$lib/api';
import { routeLoad } from '$lib/load';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ fetch, params }) => {
  return routeLoad(apiWith<{ release: ReleaseDetail }>(fetch, `/repositories/${params.owner}/${params.repo}/releases/by-tag?tag=${encodeURIComponent(params.tag)}`));
};
