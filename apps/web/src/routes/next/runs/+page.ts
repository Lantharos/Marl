import type { RunSummary } from '@marl/contracts';
import { apiWith } from '#lib/api.js';
import { routeLoad } from '#lib/load.js';
import { readRunQuery, runListPath } from '#lib/runs/list/run-query.js';
import type { PageLoad } from './$types';

export const load = (async ({ fetch, url }) => {
  const filters = readRunQuery(url);
  const repository = url.searchParams.get('repository');
  const endpoint = repository ? `/repositories/${repository}/runs` : '/runs';
  const result = await routeLoad(
    apiWith<{ runs: RunSummary[]; nextCursor: string | null }>(fetch, runListPath(endpoint, filters))
  );
  return { ...result, ...filters, repository, endpoint };
}) satisfies PageLoad;
