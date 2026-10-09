import type { WorkflowDetail } from '@marl/contracts';
import { apiWith } from '#lib/api.js';
import { routeLoad } from '#lib/load.js';
import type { PageLoad } from './$types';

export const load = (async ({ fetch, params }) =>
  routeLoad(
    apiWith<{ workflow: WorkflowDetail }>(
      fetch,
      `/repositories/${params.owner}/${params.repo}/workflows/${params.workflow}`
    )
  )) satisfies PageLoad;
