import {
	authedFetch,
	notifyProjectStatsChanged,
	pageQuery,
	publicFetch,
	type ApiOptions,
	type PageOptions,
	type Paginated
} from './apiShared';

export interface Issue {
	id: string;
	number: number;
	title: string;
	body: string;
	status: 'open' | 'closed';
	state?: 'open' | 'closed';
	state_reason?: 'completed' | 'not_planned' | 'duplicate' | string | null;
	author: string;
	author_profile?: import('./api').UserProfile | null;
	assignees?: string[];
	created_at: string;
	updated_at?: string;
	closed_at?: string | null;
	labels: string[];
	components: string[];
	milestone?: string | null;
	workspace?: string | null;
	issue_type?: IssueType | null;
	locked?: boolean;
	pinned?: boolean;
	comment_count?: number;
}

export type IssueType = 'bug' | 'feature' | 'task';

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
	const response = await publicFetch(`/v1/tenants/${tenant}/projects/${project}/issues/${encodeURIComponent(issueId)}`, { signal: options.signal });
	const issue = (await response.json()) as Issue;
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

export async function createIssue(
	tenant: string,
	project: string,
	issue: { title: string; body: string; labels?: string[]; components?: string[]; assignee?: string; assignees?: string[]; milestone?: string | null; issue_type?: IssueType | null }
) {
	const response = await authedFetch(`/v1/tenants/${tenant}/projects/${project}/issues`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(issue)
	});
	const item = (await response.json()) as Issue;
	notifyProjectStatsChanged(tenant, project);
	return item;
}

export async function updateIssue(
	tenant: string,
	project: string,
	issueId: string,
	issue: { title?: string; body?: string; state?: 'open' | 'closed'; status?: 'open' | 'closed'; labels?: string[]; components?: string[]; assignees?: string[]; milestone?: string | null; issue_type?: IssueType | null; workspace?: string | null; locked?: boolean; pinned?: boolean }
): Promise<Issue> {
	const response = await authedFetch(`/v1/tenants/${tenant}/projects/${project}/issues/${encodeURIComponent(issueId)}`, {
		method: 'PATCH',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(issue)
	});
	const item = (await response.json()) as Issue;
	if (issue.status || issue.state) notifyProjectStatsChanged(tenant, project);
	return item;
}

export async function addIssueLabel(tenant: string, project: string, issueId: string, label: string): Promise<Issue> {
	const response = await authedFetch(`/v1/tenants/${tenant}/projects/${project}/issues/${encodeURIComponent(issueId)}/labels`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ label, labels: [label] })
	});
	return (await response.json()) as Issue;
}

export async function setIssueLabels(tenant: string, project: string, issueId: string, labels: string[]): Promise<Issue> {
	return updateIssue(tenant, project, issueId, { labels });
}

export async function assignIssue(tenant: string, project: string, issueId: string, user: string): Promise<Issue> {
	const response = await authedFetch(`/v1/tenants/${tenant}/projects/${project}/issues/${encodeURIComponent(issueId)}/assignees`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ user, assignees: [user] })
	});
	return (await response.json()) as Issue;
}

export async function setIssueAssignees(tenant: string, project: string, issueId: string, assignees: string[]): Promise<Issue> {
	return updateIssue(tenant, project, issueId, { assignees });
}

export async function setIssueMilestone(tenant: string, project: string, issueId: string, milestone: string | null): Promise<Issue> {
	return updateIssue(tenant, project, issueId, { milestone });
}

export async function setIssueType(tenant: string, project: string, issueId: string, issueType: IssueType | null): Promise<Issue> {
	return updateIssue(tenant, project, issueId, { issue_type: issueType });
}

export async function setIssueWorkspace(tenant: string, project: string, issueId: string, workspace: string | null): Promise<Issue> {
	return updateIssue(tenant, project, issueId, { workspace });
}

export async function setIssueLocked(tenant: string, project: string, issueId: string, locked: boolean): Promise<Issue> {
	return updateIssue(tenant, project, issueId, { locked });
}

export async function setIssuePinned(tenant: string, project: string, issueId: string, pinned: boolean): Promise<Issue> {
	return updateIssue(tenant, project, issueId, { pinned });
}

export async function transferIssue(tenant: string, project: string, issueId: string, targetTenant: string, targetProject: string): Promise<Issue> {
	const response = await authedFetch(`/v1/tenants/${tenant}/projects/${project}/issues/${encodeURIComponent(issueId)}/transfer`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ tenant: targetTenant, project: targetProject })
	});
	notifyProjectStatsChanged(tenant, project);
	notifyProjectStatsChanged(targetTenant, targetProject);
	return (await response.json()) as Issue;
}

export async function deleteIssue(tenant: string, project: string, issueId: string): Promise<void> {
	await authedFetch(`/v1/tenants/${tenant}/projects/${project}/issues/${encodeURIComponent(issueId)}`, { method: 'DELETE' });
	notifyProjectStatsChanged(tenant, project);
}

export async function updateIssueStatus(tenant: string, project: string, issueId: string, status: 'open' | 'closed', reason: 'completed' | 'not_planned' | 'duplicate' = 'completed'): Promise<Issue> {
	const response = await authedFetch(`/v1/tenants/${tenant}/projects/${project}/issues/${encodeURIComponent(issueId)}/${status === 'open' ? 'reopen' : 'close'}`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ reason })
	});
	const item = (await response.json()) as Issue;
	notifyProjectStatsChanged(tenant, project);
	return item;
}
