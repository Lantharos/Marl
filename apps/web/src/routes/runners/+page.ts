import type { RunnerSummary } from '@sty/contracts';
import { apiWith } from '$lib/api';
import { routeLoad } from '$lib/load';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ fetch }) => routeLoad(apiWith<{ runners: RunnerSummary[] }>(fetch, '/runners'));
