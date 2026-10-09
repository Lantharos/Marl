import { apiWith } from '#lib/api.js';
import { routeLoad } from '#lib/load.js';
import type { BranchSummary } from '#lib/repositories/browser/types.js';
import type { LayoutLoad } from './$types';

export const load = (async ({ fetch, params }) =>
  routeLoad(
    apiWith<{ branches: BranchSummary[] }>(fetch, `/repositories/${params.owner}/${params.repo}/branches`)
  )) satisfies LayoutLoad;
