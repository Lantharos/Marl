import { apiWith } from '$lib/api';
import { routeLoad } from '$lib/load';
import type { PageLoad } from './$types';

export const load = (({ fetch }) =>
  routeLoad(apiWith<{ emailVerificationRequired: boolean }>(fetch, '/auth/config'))) satisfies PageLoad;
