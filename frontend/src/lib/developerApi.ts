import { authedFetch, pageQuery, publicFetch } from './apiShared';
import type { ApiOptions, PageOptions, Paginated } from './apiShared';
import type { DeveloperApp, ProjectApiKey, ProjectIntegration, ProjectWebhook } from './protocolTypes';

export async function listProjectApiKeys(
	tenant: string,
	project: string,
	options: PageOptions = {}
): Promise<Paginated<ProjectApiKey>> {
	const response = await authedFetch(`/v1/tenants/${tenant}/projects/${project}/api-keys${pageQuery(options)}`, { signal: options.signal });
	return (await response.json()) as Paginated<ProjectApiKey>;
}

export async function createProjectApiKey(
	tenant: string,
	project: string,
	input: { name: string; scopes: string[]; expires_at?: string | null }
): Promise<ProjectApiKey> {
	const response = await authedFetch(`/v1/tenants/${tenant}/projects/${project}/api-keys`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(input)
	});
	return (await response.json()) as ProjectApiKey;
}

export async function deleteProjectApiKey(tenant: string, project: string, id: string) {
	await authedFetch(`/v1/tenants/${tenant}/projects/${project}/api-keys/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export async function listProjectWebhooks(
	tenant: string,
	project: string,
	options: PageOptions = {}
): Promise<Paginated<ProjectWebhook>> {
	const response = await authedFetch(`/v1/tenants/${tenant}/projects/${project}/webhooks${pageQuery(options)}`, { signal: options.signal });
	return (await response.json()) as Paginated<ProjectWebhook>;
}

export async function createProjectWebhook(
	tenant: string,
	project: string,
	input: { name: string; url: string; events: string[] }
): Promise<ProjectWebhook> {
	const response = await authedFetch(`/v1/tenants/${tenant}/projects/${project}/webhooks`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(input)
	});
	return (await response.json()) as ProjectWebhook;
}

export async function deleteProjectWebhook(tenant: string, project: string, id: string) {
	await authedFetch(`/v1/tenants/${tenant}/projects/${project}/webhooks/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export async function testProjectWebhook(tenant: string, project: string, id: string) {
	const response = await authedFetch(`/v1/tenants/${tenant}/projects/${project}/webhooks/${encodeURIComponent(id)}/test`, { method: 'POST' });
	return (await response.json()) as { ok: boolean; status: number };
}

export async function listProjectIntegrations(
	tenant: string,
	project: string,
	options: PageOptions = {}
): Promise<Paginated<ProjectIntegration>> {
	const response = await authedFetch(`/v1/tenants/${tenant}/projects/${project}/integrations${pageQuery(options)}`, { signal: options.signal });
	return (await response.json()) as Paginated<ProjectIntegration>;
}

export async function deleteProjectIntegration(tenant: string, project: string, id: string) {
	await authedFetch(`/v1/tenants/${tenant}/projects/${project}/integrations/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export async function listDeveloperApps(options: PageOptions = {}): Promise<Paginated<DeveloperApp>> {
	const response = await authedFetch(`/v1/developer/apps${pageQuery(options)}`, { signal: options.signal });
	return (await response.json()) as Paginated<DeveloperApp>;
}

export async function createDeveloperApp(input: {
	name: string;
	redirect_uri: string;
	description?: string | null;
	homepage_url?: string | null;
}): Promise<DeveloperApp> {
	const response = await authedFetch('/v1/developer/apps', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(input)
	});
	return (await response.json()) as DeveloperApp;
}

export async function deleteDeveloperApp(id: string) {
	await authedFetch(`/v1/developer/apps/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export async function getOAuthApp(clientId: string, options: ApiOptions = {}): Promise<DeveloperApp> {
	const response = await publicFetch(`/v1/oauth/apps/${encodeURIComponent(clientId)}`, { signal: options.signal });
	return (await response.json()) as DeveloperApp;
}

export async function authorizeOAuthApp(input: {
	client_id: string;
	redirect_uri: string;
	tenant: string;
	project: string;
	scope?: string;
	scopes?: string[];
	state?: string | null;
}): Promise<{ code: string; redirect_url: string }> {
	const response = await authedFetch('/v1/oauth/authorize', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(input)
	});
	return (await response.json()) as { code: string; redirect_url: string };
}
