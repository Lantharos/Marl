import type { RequestHandler } from '@sveltejs/kit';
import { apiUrl } from '$lib/loadApi';

export const GET: RequestHandler = async ({ params, fetch }) => {
	const tenant = params.tenant;
	const project = params.project;
	const version = params.version;
	const filename = params.filename;
	if (!tenant || !project || !version || !filename) {
		return new Response('Not found', { status: 404 });
	}

	const response = await fetch(
		apiUrl(
			`/v1/tenants/${encodeURIComponent(tenant)}/projects/${encodeURIComponent(project)}/releases/${encodeURIComponent(version)}/download/${encodeURIComponent(filename)}`
		)
	);

	if (!response.ok) {
		return new Response(await response.text(), { status: response.status });
	}

	const headers = new Headers(response.headers);
	headers.delete('content-encoding');
	return new Response(response.body, {
		status: response.status,
		headers
	});
};
