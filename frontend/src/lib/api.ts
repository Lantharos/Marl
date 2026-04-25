import { apiBase, getStyToken } from './session';

export interface ProjectSummary {
	tenant: string;
	project: string;
	owner: string;
}

export interface TenantSummary {
	name: string;
	kind: 'user' | 'org' | string;
	owner: string;
}

export interface WorkspaceSummary {
	name: string;
	head: string | null;
}

export interface TreeEntryInfo {
	path: string;
	name: string;
	id: string;
	entry_type: 'blob' | 'tree' | string;
}

export interface ProjectTree {
	workspace: string;
	head: string | null;
	root_tree: string | null;
	entries: TreeEntryInfo[];
}

export interface ProjectDetail {
	project: ProjectSummary;
	workspaces: WorkspaceSummary[];
}

export interface ProjectFile {
	path: string;
	id: string;
	text: string | null;
	binary: boolean;
}

export interface Issue {
	id: string;
	number: number;
	title: string;
	body: string;
	status: 'open' | 'closed';
	author: string;
	created_at: string;
	labels: string[];
}

export interface Comment {
	id: string;
	author: string;
	body: string;
	created_at: string;
}

export interface WorkspaceStatus {
	name: string;
	head: string | null;
	status: 'draft' | 'ready' | 'merged';
	ci_status: 'passing' | 'failing' | 'running' | 'unknown';
	parent_workspace: string | null;
	child_workspaces: string[];
	is_ready: boolean;
	mergeable: boolean;
	behind_count: number;
	ahead_count: number;
}

export interface MergeRequest {
	workspace: string;
	author: string;
	status: 'open' | 'merged' | 'closed';
	created_at: string;
	head: string | null;
	base_workspace: string;
	checks_passing: boolean;
	description: string;
}

export interface HistoryEntry {
	id: string;
	kind: 'save' | 'ship' | 'cram' | 'merge' | 'ready';
	message: string;
	author: string;
	timestamp: string;
	workspace: string;
	agent?: string;
	model?: string;
	tool?: string;
}

export interface ChangedFile {
	path: string;
	additions: number;
	deletions: number;
	old_text: string | null;
	new_text: string | null;
}

export interface HistoryEntryDetail extends HistoryEntry {
	files_changed: ChangedFile[];
}

export interface ProjectSettings {
	visibility: 'public' | 'private';
	starred_count: number;
	is_starred: boolean;
	default_workspace: string;
}

export interface CiStatus {
	status: 'passing' | 'failing' | 'running' | 'unknown';
	url: string | null;
	stages: { name: string; status: string }[];
}

export interface Activity {
	id: string;
	kind: 'save' | 'ship' | 'issue' | 'ready' | 'merge' | 'star';
	actor: string;
	message: string;
	timestamp: string;
	workspace?: string;
}

export interface ProjectOverview {
	project: ProjectSummary;
	stats: {
		workspace_count: number;
		issue_count: number;
		open_ready_count: number;
		star_count: number;
	};
	recent_activity: Activity[];
	default_workspace: string;
}

async function authedFetch(path: string, init: RequestInit = {}) {
	const token = await getStyToken();
	if (!token) {
		throw new Error('Sign in first');
	}
	const headers = new Headers(init.headers);
	headers.set('authorization', `Bearer ${token}`);
	const response = await fetch(`${apiBase()}${path}`, { ...init, headers });
	if (!response.ok) {
		throw new Error(await response.text());
	}
	return response;
}

export async function getMe() {
	const response = await authedFetch('/v1/me');
	return (await response.json()) as { user: string; tenants: TenantSummary[] };
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

export async function listTenantProjects(tenant: string): Promise<ProjectSummary[]> {
	const all = await listProjects();
	return all.filter((p) => p.tenant === tenant);
}

export async function createOrg(name: string) {
	const response = await authedFetch('/v1/orgs', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ name })
	});
	return (await response.json()) as TenantSummary;
}

export async function createProject(slug: string) {
	const [tenant, project] = slug.split('/');
	await authedFetch(`/v1/tenants/${tenant}/projects/${project}`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({})
	});
}

export async function getProject(tenant: string, project: string) {
	const response = await authedFetch(`/v1/tenants/${tenant}/projects/${project}`);
	return (await response.json()) as ProjectDetail;
}

export async function getProjectTree(tenant: string, project: string, workspace = 'main') {
	const response = await authedFetch(
		`/v1/tenants/${tenant}/projects/${project}/tree?workspace=${encodeURIComponent(workspace)}`
	);
	return (await response.json()) as ProjectTree;
}

export async function getProjectFile(tenant: string, project: string, path: string, workspace = 'main') {
	const response = await authedFetch(
		`/v1/tenants/${tenant}/projects/${project}/files/${encodeURIComponent(path)}?workspace=${encodeURIComponent(workspace)}`
	);
	return (await response.json()) as ProjectFile;
}

export async function listIssues(tenant: string, project: string) {
	const response = await authedFetch(`/v1/tenants/${tenant}/projects/${project}/issues`);
	return (await response.json()) as { issues: Issue[] };
}

export async function getIssue(tenant: string, project: string, issueId: string): Promise<Issue & { comments: Comment[] }> {
	const issues = await listIssues(tenant, project);
	const issue = issues.issues.find((i) => i.id === issueId || String(i.number) === issueId);
	if (!issue) throw new Error('Issue not found');
	return { ...issue, comments: [] };
}

export async function createIssue(tenant: string, project: string, issue: { title: string; body: string }) {
	const response = await authedFetch(`/v1/tenants/${tenant}/projects/${project}/issues`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(issue)
	});
	return (await response.json()) as Issue;
}

export async function createIssueComment(tenant: string, project: string, issueId: string, body: string) {
	await new Promise((r) => setTimeout(r, 300));
	return { id: crypto.randomUUID(), author: 'you', body, created_at: new Date().toISOString() } as Comment;
}

export async function listWorkspaceStatuses(tenant: string, project: string): Promise<WorkspaceStatus[]> {
	const response = await authedFetch(`/v1/tenants/${tenant}/projects/${project}/workspaces`);
	const data = (await response.json()) as { workspaces: WorkspaceStatus[] };
	return data.workspaces;
}

export async function getWorkspaceDetail(tenant: string, project: string, workspace: string): Promise<WorkspaceStatus & { history: HistoryEntry[]; files: ProjectTree }> {
	const [statuses, tree, history] = await Promise.all([
		listWorkspaceStatuses(tenant, project),
		getProjectTree(tenant, project, workspace),
		getWorkspaceHistory(tenant, project, workspace)
	]);
	const status = statuses.find((s) => s.name === workspace);
	return { ...(status ?? statuses[0]), history, files: tree };
}

export async function listMergeRequests(tenant: string, project: string): Promise<MergeRequest[]> {
	const workspaces = await listWorkspaceStatuses(tenant, project);
	return workspaces
		.filter((w) => w.is_ready)
		.map((w) => ({
			workspace: w.name,
			author: 'unknown',
			status: 'open' as const,
			created_at: new Date().toISOString(),
			head: w.head,
			base_workspace: w.parent_workspace ?? 'main',
			checks_passing: w.ci_status === 'passing',
			description: ''
		}));
}

export async function getMergeRequestDetail(tenant: string, project: string, workspace: string): Promise<MergeRequest & { comments: Comment[]; diff_stats: { additions: number; deletions: number } }> {
	const mrs = await listMergeRequests(tenant, project);
	const mr = mrs.find((m) => m.workspace === workspace);
	if (!mr) throw new Error('Merge request not found');
	return { ...mr, comments: [], diff_stats: { additions: 0, deletions: 0 } };
}

export async function mergeWorkspace(tenant: string, project: string, workspace: string) {
	await authedFetch(`/v1/tenants/${tenant}/projects/${project}/workspaces/${workspace}/merge`, {
		method: 'POST'
	});
}

export async function markWorkspaceReady(tenant: string, project: string, workspace: string) {
	await authedFetch(`/v1/tenants/${tenant}/projects/${project}/workspaces/${workspace}/ready`, {
		method: 'POST'
	});
}

export async function getWorkspaceHistory(tenant: string, project: string, workspace: string): Promise<HistoryEntry[]> {
	const response = await authedFetch(`/v1/tenants/${tenant}/projects/${project}/workspaces/${workspace}/history`);
	const data = (await response.json()) as { entries: HistoryEntry[] };
	return data.entries;
}

export async function getProjectHistory(tenant: string, project: string): Promise<HistoryEntry[]> {
	const workspaces = await listWorkspaceStatuses(tenant, project);
	const all = await Promise.all(workspaces.map((w) => getWorkspaceHistory(tenant, project, w.name)));
	return all.flat().sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
}

export async function getHistoryEntryDetail(tenant: string, project: string, entryId: string): Promise<HistoryEntryDetail> {
	await new Promise((r) => setTimeout(r, 200));
	return {
		id: entryId,
		kind: 'save',
		message: 'Stub history entry',
		author: 'unknown',
		timestamp: new Date().toISOString(),
		workspace: 'main',
		files_changed: []
	};
}

export async function getProjectReadme(tenant: string, project: string): Promise<string | null> {
	try {
		const tree = await getProjectTree(tenant, project, 'main');
		const readmeEntry = tree.entries.find(
			(e) => e.entry_type === 'blob' && e.name.toLowerCase() === 'readme.md'
		);
		if (!readmeEntry) return null;
		const file = await getProjectFile(tenant, project, readmeEntry.path, 'main');
		return file.text;
	} catch {
		return null;
	}
}

export async function getProjectOverview(tenant: string, project: string): Promise<ProjectOverview> {
	const detail = await getProject(tenant, project);
	const issues = await listIssues(tenant, project);
	const workspaces = await listWorkspaceStatuses(tenant, project);
	return {
		project: detail.project,
		stats: {
			workspace_count: detail.workspaces.length,
			issue_count: issues.issues.length,
			open_ready_count: workspaces.filter((w) => w.is_ready).length,
			star_count: 0
		},
		recent_activity: [],
		default_workspace: 'main'
	};
}

export async function getProjectSettings(tenant: string, project: string): Promise<ProjectSettings> {
	const response = await authedFetch(`/v1/tenants/${tenant}/projects/${project}/settings`);
	return (await response.json()) as ProjectSettings;
}

export async function updateProjectSettings(tenant: string, project: string, settings: Partial<ProjectSettings>) {
	const response = await authedFetch(`/v1/tenants/${tenant}/projects/${project}/settings`, {
		method: 'PATCH',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(settings)
	});
	return (await response.json()) as ProjectSettings;
}

export async function starProject(tenant: string, project: string) {
	await authedFetch(`/v1/tenants/${tenant}/projects/${project}/star`, { method: 'POST' });
}

export async function unstarProject(tenant: string, project: string) {
	await authedFetch(`/v1/tenants/${tenant}/projects/${project}/star`, { method: 'DELETE' });
}

export async function getCiStatus(tenant: string, project: string, workspace: string): Promise<CiStatus> {
	return { status: 'unknown', url: null, stages: [] };
}
