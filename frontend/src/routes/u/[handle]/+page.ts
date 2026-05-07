import { error, redirect } from '@sveltejs/kit';
import type { UserProfilePage } from '$lib/api';
import { loadApiFetch } from '$lib/loadApi';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ fetch, params }) => {
	const response = await loadApiFetch(fetch, `/v1/users/${encodeURIComponent(params.handle)}/profile`);
	if (!response.ok) {
		error(response.status, response.status === 404 ? 'Profile not found' : 'Profile unavailable');
	}
	const profile = (await response.json()) as UserProfilePage;
	redirect(307, `/${profile.tenant}`);
};
