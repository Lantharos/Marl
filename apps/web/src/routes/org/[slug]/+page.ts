import type { PublicOrganizationProfile } from '@marl/contracts';
import { apiWith } from '$lib/api';
import { routeLoad } from '$lib/load';
import type { PageLoad } from './$types';

export const load: PageLoad = ({ fetch, params }) => routeLoad(apiWith<PublicOrganizationProfile>(fetch, `/orgs/${encodeURIComponent(params.slug)}`));
