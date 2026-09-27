import type { Webhook } from '@marl/contracts';
import { apiWith } from '$lib/api';
import { routeLoad } from '$lib/load';
import type { PageLoad } from './$types';

export const load = (({ fetch, params }) =>
  routeLoad(
    apiWith<{ webhooks: Webhook[] }>(fetch, `/repositories/${params.owner}/${params.repo}/webhooks`)
  )) satisfies PageLoad;
