import { apiWith } from '#lib/api.js';
import { routeLoad } from '#lib/load.js';
import type { PageLoad } from './$types';

export const load = (async ({ fetch }) =>
  routeLoad(
    apiWith<{
      repositories: Array<{
        owner: string;
        name: string;
        deletionScheduledAt: string;
        deletionStartedAt: string | null;
      }>;
    }>(fetch, '/repositories/deleted')
  )) satisfies PageLoad;
