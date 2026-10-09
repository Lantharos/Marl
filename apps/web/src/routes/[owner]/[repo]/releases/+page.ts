import type { ReleaseSummary } from '@marl/contracts';
import { apiWith } from '#lib/api.js';
import { routeLoad } from '#lib/load.js';
import type { PageLoad } from './$types';

export const load = (async ({ fetch, params }) => {
  return routeLoad(
    apiWith<{
      releases: ReleaseSummary[];
      nextCursor: string | null;
      canCreate: boolean;
    }>(fetch, `/repositories/${params.owner}/${params.repo}/releases?limit=30`)
  );
}) satisfies PageLoad;
