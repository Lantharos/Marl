import type { PublicIdentityProfile } from '@marl/contracts';
import { apiWith } from '$lib/api';
import { routeLoad } from '$lib/load';
import type { PageLoad } from './$types';

export const load: PageLoad = ({ fetch, params }) => routeLoad(apiWith<PublicIdentityProfile>(fetch, `/profiles/${encodeURIComponent(params.identity)}`));
