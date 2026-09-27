import type { RunnerSummary } from '@marl/contracts';
import { apiWith } from '$lib/api';
import { routeLoad } from '$lib/load';
import type { PageLoad } from './$types';

export const load = (async ({ fetch }) =>
  routeLoad(apiWith<{ runners: RunnerSummary[] }>(fetch, '/runners'))) satisfies PageLoad;
