import type { DeveloperToken } from '@marl/contracts';
import { apiWith } from '$lib/api';
import { routeLoad } from '$lib/load';
import type { PageLoad } from './$types';

export const load = (({ fetch }) =>
  routeLoad(apiWith<{ tokens: DeveloperToken[] }>(fetch, '/tokens'))) satisfies PageLoad;
