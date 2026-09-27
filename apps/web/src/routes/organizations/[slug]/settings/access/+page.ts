import type { OrganizationAccess } from '@marl/contracts';
import { apiWith } from '$lib/api';
import { routeLoad } from '$lib/load';
import type { PageLoad } from './$types';

export const load = (({ fetch, params }) =>
  routeLoad(apiWith<OrganizationAccess>(fetch, `/organizations/${params.slug}/access`))) satisfies PageLoad;
