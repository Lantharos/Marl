import type { RunSummary } from '@sty/contracts';
import { apiWith } from '$lib/api';
import { routeLoad } from '$lib/load';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ fetch, params }) => routeLoad(apiWith<{ runs: RunSummary[] }>(fetch, `/repositories/${params.owner}/${params.repo}/runs`));
