import { error } from '@sveltejs/kit';
import type { Paginated, ProjectDiscoveryItem, TenantFolder, UserProfilePage } from '$lib/api';
import { loadApiFetch } from '$lib/loadApi';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ fetch, params, url }) => {
	const page = Math.max(1, Number(url.searchParams.get('page') ?? '1') || 1);
	const query = url.searchParams.get('q')?.trim() ?? '';
	const search = new URLSearchParams({ page: String(page), per_page: '30' });
	if (query) search.set('q', query);
	const response = await loadApiFetch(fetch, `/v1/tenants/${encodeURIComponent(params.tenant)}/projects?${search}`);
	if (!response.ok) {
		error(response.status, response.status === 404 ? 'Tenant not found' : 'Projects unavailable');
	}
	const foldersResponse = await loadApiFetch(fetch, `/v1/tenants/${encodeURIComponent(params.tenant)}/folders`);
	const folders = foldersResponse.ok ? ((await foldersResponse.json()) as { folders: TenantFolder[] }).folders : [];
	const profileResponse = await loadApiFetch(fetch, `/v1/profiles/${encodeURIComponent(params.tenant)}`);
	const profile = profileResponse.ok ? ((await profileResponse.json()) as UserProfilePage) : null;
	return {
		tenant: params.tenant,
		query,
		projects: (await response.json()) as Paginated<ProjectDiscoveryItem>,
		folders,
		profile,
		seo: {
			title: profile ? `${profile.profile.display_name} - sty` : `${params.tenant} projects - sty`,
			description: profile
				? `Public work from ${profile.profile.display_name} on sty.`
				: `Public projects from ${params.tenant} on sty.`
		}
	};
};
