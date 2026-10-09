import type { AccountProfile } from '@marl/contracts';
import { apiWith } from '#lib/api.js';
import { routeLoad } from '#lib/load.js';
import type { PageLoad } from './$types';

export const load = (({ fetch }) =>
  routeLoad(apiWith<{ profile: AccountProfile }>(fetch, '/profile'))) satisfies PageLoad;
