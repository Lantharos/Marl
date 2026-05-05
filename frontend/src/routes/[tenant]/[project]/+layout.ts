import { error } from '@sveltejs/kit';
import type { AccessResponse, ProjectSettings, ProjectStats } from '$lib/api';
import { loadApiFetch } from '$lib/loadApi';
import type { LayoutLoad } from './$types';

async function loadProjectChromeItem<T>(fetch: typeof globalThis.fetch, path: string) {
	const response = await loadApiFetch(fetch, path);
	if (response.status === 404) {
		error(404, 'Project not found');
	}
	if (response.status === 401 || response.status === 403) {
		return null;
	}
	if (!response.ok) {
		return null;
	}
	return (await response.json()) as T;
}

export const load: LayoutLoad = async ({ fetch, params }) => {
	const base = `/v1/tenants/${encodeURIComponent(params.tenant)}/projects/${encodeURIComponent(params.project)}`;
	const [settings, stats, access] = await Promise.all([
		loadProjectChromeItem<ProjectSettings>(fetch, `${base}/settings`),
		loadProjectChromeItem<ProjectStats>(fetch, `${base}/stats`),
		loadProjectChromeItem<AccessResponse>(fetch, `${base}/access`)
	]);
	return {
		projectChrome: { settings, stats, access }
	};
};
