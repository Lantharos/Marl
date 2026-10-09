import type { WorkItemLabel, IssueSummary } from '@marl/contracts';
import { apiWith } from '#lib/api.js';
import { issuePage, readIssueFilters } from '#lib/issues/list/issue-list.js';
import { routeLoad } from '#lib/load.js';
import type { PageLoad } from './$types';

export const load = (async ({ fetch, params, url }) => {
  const filters = readIssueFilters(url);
  const result = await routeLoad(
    apiWith<{
      issues: IssueSummary[];
      nextCursor: string | null;
      availableLabels: WorkItemLabel[];
      counts: { open?: number; closed?: number };
    }>(fetch, `/repositories/${params.owner}/${params.repo}/issues?${issuePage(filters, 30)}`)
  );
  return { ...result, filters };
}) satisfies PageLoad;
