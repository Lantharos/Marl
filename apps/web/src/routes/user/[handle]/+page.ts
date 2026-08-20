import type { PublicUserProfile } from '@marl/contracts';
import { apiWith } from '$lib/api';
import { routeLoad } from '$lib/load';
import type { PageLoad } from './$types';

export const load: PageLoad = ({ fetch, params }) => routeLoad(apiWith<PublicUserProfile>(fetch, `/users/${encodeURIComponent(params.handle)}`));
