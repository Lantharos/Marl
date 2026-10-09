import { apiWith } from '#lib/api.js';
import { routeLoad } from '#lib/load.js';
import type { PageLoad } from './$types';

export const load = (({ fetch }) =>
  routeLoad(apiWith<{ emailVerificationRequired: boolean }>(fetch, '/auth/config'))) satisfies PageLoad;
