import type { RunnerSummary } from '@marl/contracts';
import { apiWith } from '$lib/api';
import { routeLoad } from '$lib/load';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ fetch, params }) => routeLoad(apiWith<{ runner: RunnerSummary }>(fetch, `/runners/${params.id}`));
