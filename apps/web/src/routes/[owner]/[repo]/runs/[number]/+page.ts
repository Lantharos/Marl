import type { RunDetail } from '@marl/contracts';
import { apiWith } from '#lib/api.js';
import { routeLoad } from '#lib/load.js';
import type { PageLoad } from './$types';

export const load = (async ({ fetch, params }) =>
  routeLoad(
    apiWith<{ run: RunDetail }>(fetch, `/repositories/${params.owner}/${params.repo}/runs/${params.number}`)
  )) satisfies PageLoad;
