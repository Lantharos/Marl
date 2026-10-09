import type { IssueSummary } from '@marl/contracts';
import { apiWith } from '#lib/api.js';
import { issuePage, readIssueFilters } from '#lib/issues/list/issue-list.js';
import { routeLoad } from '#lib/load.js';
import type { PageLoad } from './$types';

export const load = (async ({ fetch, url }) => {
  const filters = readIssueFilters(url);
  const result = await routeLoad(
    apiWith<{ issues: IssueSummary[]; nextCursor: string | null }>(fetch, `/issues?${issuePage(filters, 40)}`)
  );
  return { ...result, filters };
}) satisfies PageLoad;
