import type { DeveloperToken } from '@marl/contracts';
import { apiWith } from '#lib/api.js';
import { routeLoad } from '#lib/load.js';
import type { PageLoad } from './$types';

export const load = (({ fetch }) =>
  routeLoad(apiWith<{ tokens: DeveloperToken[] }>(fetch, '/tokens'))) satisfies PageLoad;
