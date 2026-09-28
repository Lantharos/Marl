import type { MergeQueueEntry } from '@marl/contracts';
import { apiWith } from '$lib/api';
import { routeLoad } from '$lib/load';
import type { PageLoad } from './$types';

export const load = (async ({ fetch, params, url }) => {
  const branch = url.searchParams.get('branch');
  return routeLoad(
    apiWith<{ branch: string; entries: MergeQueueEntry[] }>(
      fetch,
      `/repositories/${params.owner}/${params.repo}/merge-queue${branch ? `?branch=${encodeURIComponent(branch)}` : ''}`
    )
  );
}) satisfies PageLoad;
