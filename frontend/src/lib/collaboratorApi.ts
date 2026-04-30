import { authedFetch, pageQuery, publicFetch } from './apiShared';
import type { ApiOptions, PageOptions, Paginated } from './apiShared';
import type { AccessResponse, Collaborator, CollaboratorRole, UserProfile } from './collaboratorTypes';

export async function getProjectAccess(tenant: string, project: string, options: ApiOptions = {}): Promise<AccessResponse> {
	const response = await publicFetch(`/v1/tenants/${tenant}/projects/${project}/access`, { signal: options.signal });
	return (await response.json()) as AccessResponse;
}

export async function searchUsers(query: string, options: PageOptions = {}): Promise<Paginated<UserProfile>> {
	const params = pageQuery(options).replace(/^\?/, '');
	const search = new URLSearchParams(params);
	if (query.trim()) search.set('q', query.trim());
	const response = await authedFetch(`/v1/users/search?${search}`, { signal: options.signal });
	return (await response.json()) as Paginated<UserProfile>;
}

export async function listTenantCollaborators(tenant: string, options: PageOptions = {}): Promise<Paginated<Collaborator>> {
	const response = await authedFetch(`/v1/tenants/${tenant}/collaborators${pageQuery(options)}`, { signal: options.signal });
	return (await response.json()) as Paginated<Collaborator>;
}

export async function addTenantCollaborator(tenant: string, user: string, role: CollaboratorRole): Promise<Collaborator> {
	const response = await authedFetch(`/v1/tenants/${tenant}/collaborators`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ user, role })
	});
	return (await response.json()) as Collaborator;
}

export async function updateTenantCollaborator(tenant: string, user: string, role: CollaboratorRole): Promise<Collaborator> {
	const response = await authedFetch(`/v1/tenants/${tenant}/collaborators/${encodeURIComponent(user)}`, {
		method: 'PATCH',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ role })
	});
	return (await response.json()) as Collaborator;
}

export async function deleteTenantCollaborator(tenant: string, user: string) {
	await authedFetch(`/v1/tenants/${tenant}/collaborators/${encodeURIComponent(user)}`, { method: 'DELETE' });
}

export async function listProjectCollaborators(tenant: string, project: string, options: PageOptions = {}): Promise<Paginated<Collaborator>> {
	const response = await authedFetch(`/v1/tenants/${tenant}/projects/${project}/collaborators${pageQuery(options)}`, { signal: options.signal });
	return (await response.json()) as Paginated<Collaborator>;
}

export async function addProjectCollaborator(tenant: string, project: string, user: string, role: CollaboratorRole): Promise<Collaborator> {
	const response = await authedFetch(`/v1/tenants/${tenant}/projects/${project}/collaborators`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ user, role })
	});
	return (await response.json()) as Collaborator;
}

export async function updateProjectCollaborator(tenant: string, project: string, user: string, role: CollaboratorRole): Promise<Collaborator> {
	const response = await authedFetch(`/v1/tenants/${tenant}/projects/${project}/collaborators/${encodeURIComponent(user)}`, {
		method: 'PATCH',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ role })
	});
	return (await response.json()) as Collaborator;
}

export async function deleteProjectCollaborator(tenant: string, project: string, user: string) {
	await authedFetch(`/v1/tenants/${tenant}/projects/${project}/collaborators/${encodeURIComponent(user)}`, { method: 'DELETE' });
}
