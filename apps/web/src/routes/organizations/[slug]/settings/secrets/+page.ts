import { apiWith } from '$lib/api';
import { routeLoad } from '$lib/load';
import type { PageLoad } from './$types';

export const load: PageLoad = ({ fetch, params }) => routeLoad(apiWith<{ organizationName: string; secrets: Array<{ id: string; name: string; createdAt: string; updatedAt: string }> }>(fetch, `/organizations/${params.slug}/secrets`));
