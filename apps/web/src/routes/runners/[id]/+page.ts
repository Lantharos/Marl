import type { RunnerSummary } from '@marl/contracts';
import { apiWith } from '#lib/api.js';
import { routeLoad } from '#lib/load.js';
import type { PageLoad } from './$types';

export const load = (async ({ fetch, params }) =>
  routeLoad(apiWith<{ runner: RunnerSummary }>(fetch, `/runners/${params.id}`))) satisfies PageLoad;
