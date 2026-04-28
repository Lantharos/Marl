import { authedFetch, pageQuery, publicFetch, type ApiOptions, type PageOptions, type Paginated } from './apiShared';

export interface Issue {
	id: string;
	number: number;
	title: string;
	body: string;
	status: 'open' | 'closed';
	state?: 'open' | 'closed';
	author: string;
	author_profile?: import('./api').UserProfile | null;
	assignees?: string[];
	created_at: string;
	updated_at?: string;
	closed_at?: string | null;
	labels: string[];
	milestone?: string | null;
	workspace?: string | null;
}

export interface Comment {
	id: string;
	author: string;
	author_profile?: import('./api').UserProfile | null;
	body: string;
	created_at: string;
	target_type?: string;
	target_id?: string;
	file?: string | null;
	line?: number | null;
	updated_at?: string;
	edited?: boolean;
}

export async function listIssuesPage(tenant: string, project: string, options: PageOptions = {}): Promise<Paginated<Issue>> {
	const response = await publicFetch(`/v1/tenants/${tenant}/projects/${project}/issues${pageQuery(options)}`, { signal: options.signal });
	const data = (await response.json()) as Paginated<Issue> | { issues?: Issue[]; items?: Issue[] };
	if ('page' in data && 'items' in data) return data;
	const items = data.issues ?? data.items ?? [];
	return { items, page: 1, per_page: items.length || 25, total: items.length, total_pages: 1, next: null, prev: null };
}

export async function listIssues(tenant: string, project: string, options: PageOptions = {}) {
	const data = await listIssuesPage(tenant, project, options);
	return { issues: data.items };
}

export async function getIssue(tenant: string, project: string, issueId: string, options: ApiOptions = {}): Promise<Issue & { comments: Comment[] }> {
	const issues = await listIssues(tenant, project, options);
	const issue = issues.issues.find((i) => i.id === issueId || String(i.number) === issueId);
	if (!issue) throw new Error('Issue not found');
	const comments = await listIssueComments(tenant, project, issue.id, options);
	return { ...issue, comments };
}

export async function listIssueComments(tenant: string, project: string, issueId: string, options: ApiOptions = {}): Promise<Comment[]> {
	const response = await publicFetch(`/v1/tenants/${tenant}/projects/${project}/issues/${encodeURIComponent(issueId)}/comments`, { signal: options.signal });
	const data = (await response.json()) as { comments: Comment[] };
	return data.comments;
}

export async function createIssueComment(tenant: string, project: string, issueId: string, body: string): Promise<Comment> {
	const response = await authedFetch(`/v1/tenants/${tenant}/projects/${project}/issues/${encodeURIComponent(issueId)}/comments`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ body })
	});
	return (await response.json()) as Comment;
}

export async function createIssue(tenant: string, project: string, issue: { title: string; body: string; labels?: string[]; assignee?: string }) {
	const response = await authedFetch(`/v1/tenants/${tenant}/projects/${project}/issues`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(issue)
	});
	return (await response.json()) as Issue;
}

export async function updateIssue(
	tenant: string,
	project: string,
	issueId: string,
	issue: { title?: string; body?: string; state?: 'open' | 'closed'; status?: 'open' | 'closed' }
): Promise<Issue> {
	const response = await authedFetch(`/v1/tenants/${tenant}/projects/${project}/issues/${encodeURIComponent(issueId)}`, {
		method: 'PATCH',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(issue)
	});
	return (await response.json()) as Issue;
}

export async function addIssueLabel(tenant: string, project: string, issueId: string, label: string): Promise<Issue> {
	const response = await authedFetch(`/v1/tenants/${tenant}/projects/${project}/issues/${encodeURIComponent(issueId)}/labels`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ label, labels: [label] })
	});
	return (await response.json()) as Issue;
}

export async function assignIssue(tenant: string, project: string, issueId: string, user: string): Promise<Issue> {
	const response = await authedFetch(`/v1/tenants/${tenant}/projects/${project}/issues/${encodeURIComponent(issueId)}/assignees`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ user, assignees: [user] })
	});
	return (await response.json()) as Issue;
}

export async function updateIssueStatus(tenant: string, project: string, issueId: string, status: 'open' | 'closed'): Promise<Issue> {
	return updateIssue(tenant, project, issueId, { status, state: status });
}
