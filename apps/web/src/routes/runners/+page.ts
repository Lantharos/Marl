import type { RunnerSummary } from '@marl/contracts';
import { apiWith } from '#lib/api.js';
import { routeLoad } from '#lib/load.js';
import type { PageLoad } from './$types';

export const load = (async ({ fetch }) =>
  routeLoad(apiWith<{ runners: RunnerSummary[] }>(fetch, '/runners'))) satisfies PageLoad;
