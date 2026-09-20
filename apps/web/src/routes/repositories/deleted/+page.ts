import { apiWith } from '$lib/api';
import { routeLoad } from '$lib/load';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ fetch }) => routeLoad(apiWith<{ repositories: Array<{ owner: string; name: string; deletionScheduledAt: string; deletionStartedAt: string | null }> }>(fetch, '/repositories/deleted'));
