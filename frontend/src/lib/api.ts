import { apiBase, getStyToken } from './session';

export interface ProjectSummary {
	tenant: string;
	project: string;
	owner: string;
}

export async function listProjects() {
	const token = await getStyToken();
	if (!token) {
		return [];
	}
	const response = await fetch(`${apiBase()}/v1/projects`, {
		headers: { authorization: `Bearer ${token}` }
	});
	if (!response.ok) {
		throw new Error(await response.text());
	}
	const body = (await response.json()) as { projects: ProjectSummary[] };
	return body.projects;
}

export async function createProject(slug: string) {
	const token = await getStyToken();
	if (!token) {
		throw new Error('Sign in first');
	}
	const [tenant, project] = slug.split('/');
	const response = await fetch(`${apiBase()}/v1/tenants/${tenant}/projects/${project}`, {
		method: 'POST',
		headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
		body: JSON.stringify({})
	});
	if (!response.ok) {
		throw new Error(await response.text());
	}
}
