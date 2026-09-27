import type { AccountSession } from '@marl/contracts';
import { apiWith } from '$lib/api';
import { routeLoad } from '$lib/load';
import type { PageLoad } from './$types';

export const load = (({ fetch }) =>
  routeLoad(apiWith<{ sessions: AccountSession[] }>(fetch, '/sessions'))) satisfies PageLoad;
