import type { RunSummary, WorkflowSummary } from '@marl/contracts';
import { apiWith } from '#lib/api.js';
import { routeLoad } from '#lib/load.js';
import { readRunQuery, runListPath } from '#lib/runs/list/run-query.js';
import type { PageLoad } from './$types';

export const load = (async ({ fetch, params, url }) => {
  const filters = readRunQuery(url);
  const repository = `/repositories/${params.owner}/${params.repo}`;
  const [workflows, runs] = await Promise.all([
    routeLoad(apiWith<{ workflows: WorkflowSummary[] }>(fetch, `${repository}/workflows`)),
    routeLoad(
      apiWith<{ runs: RunSummary[]; nextCursor: string | null }>(fetch, runListPath(`${repository}/runs`, filters))
    )
  ]);
  return { workflows: workflows.workflows, ...runs, ...filters };
}) satisfies PageLoad;
