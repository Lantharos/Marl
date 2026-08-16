import type { RepositorySummary } from '@sty/contracts';
import { apiWith } from '$lib/api';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ fetch, params }) => apiWith<{ repository: RepositorySummary & { role: 'owner' | 'member' }; organizations: Array<{ slug: string; name: string }> }>(fetch, `/repositories/${params.owner}/${params.repo}/settings`);
