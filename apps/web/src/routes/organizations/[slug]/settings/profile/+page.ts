import type { OrganizationProfile, OrganizationRole } from '@marl/contracts';
import { apiWith } from '$lib/api';
import { routeLoad } from '$lib/load';
import type { PageLoad } from './$types';

export const load = (({ fetch, params }) =>
  routeLoad(
    apiWith<{ organization: OrganizationProfile; viewerRole: OrganizationRole }>(fetch, `/organizations/${params.slug}`)
  )) satisfies PageLoad;
