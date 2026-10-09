import type { OrganizationSummary } from '@marl/contracts';
import { apiWith } from '#lib/api.js';
import { routeLoad } from '#lib/load.js';
import type { PageLoad } from './$types';

export const load = (({ fetch }) =>
  routeLoad(apiWith<{ organizations: OrganizationSummary[] }>(fetch, '/organizations'))) satisfies PageLoad;
