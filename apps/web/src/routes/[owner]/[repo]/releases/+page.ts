import type { ReleaseSummary } from '@marl/contracts';
import { apiWith } from '$lib/api';
import { routeLoad } from '$lib/load';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ fetch, params }) => {
  return routeLoad(
    apiWith<{
      releases: ReleaseSummary[];
      nextCursor: string | null;
      canCreate: boolean;
    }>(fetch, `/repositories/${params.owner}/${params.repo}/releases`)
  );
};
