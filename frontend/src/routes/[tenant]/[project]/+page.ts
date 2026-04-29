import { error } from '@sveltejs/kit';
import type { ProjectOverview } from '$lib/api';
import { apiUrl } from '$lib/loadApi';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ fetch, params }) => {
	const target = `${params.tenant}/${params.project}`;
	const response = await fetch(apiUrl(`/v1/tenants/${encodeURIComponent(params.tenant)}/projects/${encodeURIComponent(params.project)}/overview`));
	if (!response.ok) {
		if (response.status === 404) {
			error(404, 'Project not found');
		}
		return {
			tenant: params.tenant,
			project: params.project,
			overview: null,
			accessStatus: response.status,
			seo: {
				title: `${target} - sty`,
				description: `Project ${target} on sty.`
			}
		};
	}
	const overview = (await response.json()) as ProjectOverview;
	const description = overview.readme?.split(/\r?\n/).find((line) => line.trim())?.slice(0, 160) ?? `${target} is a PIG project hosted on sty.`;
	return {
		tenant: params.tenant,
		project: params.project,
		overview,
		accessStatus: 200,
		seo: {
			title: `${target} - sty`,
			description
		}
	};
};
