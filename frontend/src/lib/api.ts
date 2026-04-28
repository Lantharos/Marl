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
	state?: 'open' | 'closed';
	author: string;
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
	body: string;
	created_at: string;
	target_type?: string;
	target_id?: string;
	file?: string | null;
	line?: number | null;
	updated_at?: string;
	edited?: boolean;
}

export interface WorkspaceStatus {
	name: string;
	head: string | null;
	status: 'draft' | 'ready' | 'merged' | string;
	parent_workspace: string | null;
	child_workspaces: string[];
	is_ready: boolean;
	mergeable: boolean;
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
	snapshot_id: string | null;
	agent?: string;
	model?: string;
	tool?: string;
}

export interface ChangedFile {
	path: string;
	change_type: string;
	old_id: string | null;
	new_id: string | null;
}

export interface NavbarItem {
	id: string;
	label: string;
	type: 'tab' | 'link';
	url?: string;
	enabled: boolean;
	order: number;
}

export interface PanelItem {
	id: string;
	title: string;
	type: 'text' | 'button' | 'link' | 'info' | 'stats' | 'workspaces' | 'activity';
	content?: string;
	url?: string;
	button_label?: string;
	enabled: boolean;
	order: number;
}

export interface ProjectSettings {
	visibility: 'public' | 'private';
	starred_count: number;
	is_starred: boolean;
	default_workspace: string;
	navbar_items: NavbarItem[];
	panels: PanelItem[];
}

export interface Activity {
	id: string;
	kind: 'save' | 'ship' | 'cram' | 'issue' | 'ready' | 'merge' | 'star';
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

export interface ApiOptions {
	signal?: AbortSignal;
}

export interface PageOptions extends ApiOptions {
	page?: number;
	perPage?: number;
	state?: 'open' | 'closed' | 'all';
	label?: string;
	assignee?: string;
}

export interface Paginated<T> {
	items: T[];
	page: number;
	per_page: number;
	total: number;
	total_pages: number;
	next: number | null;
	prev: number | null;
}

export interface CapabilityResponse {
	version: string;
	capabilities: string[];
}

export interface ProtocolItem {
	id: string;
	name?: string;
	title?: string;
	tag?: string;
	body?: string;
	description?: string;
	state?: string;
	event?: string;
	url?: string;
	color?: string;
	author?: string;
	created_at?: string;
	updated_at?: string;
	[key: string]: unknown;
}

export type ProtocolDraft = Omit<ProtocolItem, 'id'> & { id?: string };

export interface Label {
	id?: string;
	name: string;
	color: string;
	description?: string | null;
}

export interface Milestone {
	id: string;
	title: string;
	description?: string | null;
	state?: 'open' | 'closed' | string;
	due_at?: string | null;
	open_issues?: number;
	closed_issues?: number;
	created_at?: string;
}

export interface Release {
	id?: string;
	tag: string;
	name?: string | null;
	notes?: string | null;
	snapshot?: string | null;
	author?: string;
	created_at?: string;
}

export interface TagInfo {
	id?: string;
	tag?: string;
	name?: string;
	snapshot?: string | null;
	author?: string;
	created_at?: string;
}

export function isAbortError(error: unknown) {
	return error instanceof Error && error.name === 'AbortError';
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

async function publicFetch(path: string, init: RequestInit = {}) {
	const token = await getStyToken();
	const headers = new Headers(init.headers);
	if (token) {
		headers.set('authorization', `Bearer ${token}`);
	}
	const response = await fetch(`${apiBase()}${path}`, { ...init, headers });
	if (!response.ok) {
		throw new Error(await response.text());
	}
	return response;
}

export async function getMe(options: ApiOptions = {}) {
	const response = await authedFetch('/v1/me', { signal: options.signal });
	return (await response.json()) as { user: string; tenants: TenantSummary[] };
}

export async function listProjects(options: ApiOptions = {}) {
	const token = await getStyToken();
	if (!token) {
		return [];
	}
	const response = await fetch(`${apiBase()}/v1/projects`, {
		headers: { authorization: `Bearer ${token}` },
		signal: options.signal
	});
	if (!response.ok) {
		throw new Error(await response.text());
	}
	const body = (await response.json()) as { projects: ProjectSummary[] };
	return body.projects;
}

export async function listTenantProjects(tenant: string, options: ApiOptions = {}): Promise<ProjectSummary[]> {
	const all = await listProjects(options);
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

export async function getProject(tenant: string, project: string, options: ApiOptions = {}) {
	const response = await publicFetch(`/v1/tenants/${tenant}/projects/${project}`, { signal: options.signal });
	return (await response.json()) as ProjectDetail;
}

export async function getProjectTree(tenant: string, project: string, workspace = 'main', snapshot?: string, options: ApiOptions = {}) {
	let url = `/v1/tenants/${tenant}/projects/${project}/tree?workspace=${encodeURIComponent(workspace)}`;
	if (snapshot) url += `&snapshot=${encodeURIComponent(snapshot)}`;
	const response = await publicFetch(url, { signal: options.signal });
	return (await response.json()) as ProjectTree;
}

export async function getProjectFile(tenant: string, project: string, path: string, workspace = 'main', snapshot?: string, options: ApiOptions = {}) {
	let url = `/v1/tenants/${tenant}/projects/${project}/files/${encodeURIComponent(path)}?workspace=${encodeURIComponent(workspace)}`;
	if (snapshot) url += `&snapshot=${encodeURIComponent(snapshot)}`;
	const response = await publicFetch(url, { signal: options.signal });
	return (await response.json()) as ProjectFile;
}

export async function getHistoryEntry(tenant: string, project: string, entryId: string, options: ApiOptions = {}): Promise<HistoryEntry> {
	const response = await publicFetch(`/v1/tenants/${tenant}/projects/${project}/history/${encodeURIComponent(entryId)}`, { signal: options.signal });
	return (await response.json()) as HistoryEntry;
}

export async function downloadObjects(tenant: string, project: string, ids: string[], options: ApiOptions = {}): Promise<{ id: string; kind: string; bytes_base64: string }[]> {
	const response = await publicFetch(`/v1/tenants/${tenant}/projects/${project}/objects/download`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ ids }),
		signal: options.signal
	});
	const data = (await response.json()) as { objects: { id: string; kind: string; bytes_base64: string }[] };
	return data.objects;
}

function pageQuery(options: PageOptions = {}) {
	const params = new URLSearchParams();
	if (options.page) params.set('page', String(options.page));
	if (options.perPage) params.set('per_page', String(options.perPage));
	if (options.state && options.state !== 'all') params.set('state', options.state);
	if (options.label) params.set('label', options.label);
	if (options.assignee) params.set('assignee', options.assignee);
	const value = params.toString();
	return value ? `?${value}` : '';
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

export async function listLabelsPage(tenant: string, project: string, options: PageOptions = {}): Promise<Paginated<Label>> {
	const response = await publicFetch(`/v1/tenants/${tenant}/projects/${project}/labels${pageQuery(options)}`, { signal: options.signal });
	const data = (await response.json()) as Paginated<Label> | { items?: Label[]; labels?: Label[] };
	if ('page' in data && 'items' in data) return data;
	const items = data.items ?? ('labels' in data ? data.labels ?? [] : []);
	return { items, page: 1, per_page: items.length || 25, total: items.length, total_pages: 1, next: null, prev: null };
}

export async function listLabels(tenant: string, project: string, options: PageOptions = {}): Promise<Label[]> {
	return (await listLabelsPage(tenant, project, options)).items;
}

export async function createLabel(tenant: string, project: string, label: Label): Promise<Label> {
	const response = await authedFetch(`/v1/tenants/${tenant}/projects/${project}/labels`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(label)
	});
	return (await response.json()) as Label;
}

export async function deleteLabel(tenant: string, project: string, name: string) {
	await authedFetch(`/v1/tenants/${tenant}/projects/${project}/labels/${encodeURIComponent(name)}`, { method: 'DELETE' });
}

export async function listMilestonesPage(tenant: string, project: string, options: PageOptions = {}): Promise<Paginated<Milestone>> {
	const response = await publicFetch(`/v1/tenants/${tenant}/projects/${project}/milestones${pageQuery(options)}`, { signal: options.signal });
	const data = (await response.json()) as Paginated<Milestone>;
	return data;
}

export async function listMilestones(tenant: string, project: string, options: PageOptions = {}): Promise<Milestone[]> {
	return (await listMilestonesPage(tenant, project, options)).items;
}

export async function createMilestone(tenant: string, project: string, milestone: Partial<Milestone>): Promise<Milestone> {
	const response = await authedFetch(`/v1/tenants/${tenant}/projects/${project}/milestones`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(milestone)
	});
	return (await response.json()) as Milestone;
}

export async function listReleasesPage(tenant: string, project: string, options: PageOptions = {}): Promise<Paginated<Release>> {
	const response = await publicFetch(`/v1/tenants/${tenant}/projects/${project}/releases${pageQuery(options)}`, { signal: options.signal });
	const data = (await response.json()) as Paginated<Release>;
	return data;
}

export async function listReleases(tenant: string, project: string, options: PageOptions = {}): Promise<Release[]> {
	return (await listReleasesPage(tenant, project, options)).items;
}

export async function createRelease(tenant: string, project: string, release: Partial<Release>): Promise<Release> {
	const response = await authedFetch(`/v1/tenants/${tenant}/projects/${project}/releases`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(release)
	});
	return (await response.json()) as Release;
}

export async function listTags(tenant: string, project: string, options: PageOptions = {}): Promise<Paginated<TagInfo>> {
	const response = await publicFetch(`/v1/tenants/${tenant}/projects/${project}/tags${pageQuery(options)}`, { signal: options.signal });
	return (await response.json()) as Paginated<TagInfo>;
}

export async function createTag(tenant: string, project: string, tag: Partial<TagInfo>): Promise<TagInfo> {
	const response = await authedFetch(`/v1/tenants/${tenant}/projects/${project}/tags`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(tag)
	});
	return (await response.json()) as TagInfo;
}

export async function getCapabilities(options: ApiOptions = {}): Promise<CapabilityResponse> {
	const response = await publicFetch('/v1/capabilities', { signal: options.signal });
	return (await response.json()) as CapabilityResponse;
}

export async function listProtocolItems(tenant: string, project: string, kind: string, options: ApiOptions = {}): Promise<Paginated<ProtocolItem>> {
	const endpoint = protocolEndpoint(kind);
	const response = await publicFetch(`/v1/tenants/${tenant}/projects/${project}/${endpoint}`, { signal: options.signal });
	return (await response.json()) as Paginated<ProtocolItem>;
}

export async function createProtocolItem(tenant: string, project: string, kind: string, item: ProtocolDraft): Promise<ProtocolItem> {
	const endpoint = protocolEndpoint(kind);
	const response = await authedFetch(`/v1/tenants/${tenant}/projects/${project}/${endpoint}`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(item)
	});
	return (await response.json()) as ProtocolItem;
}

export async function deleteProtocolItem(tenant: string, project: string, kind: string, id: string) {
	const endpoint = protocolEndpoint(kind);
	await authedFetch(`/v1/tenants/${tenant}/projects/${project}/${endpoint}/${encodeURIComponent(id)}`, {
		method: 'DELETE'
	});
}

export async function searchProject(tenant: string, project: string, query: string, options: ApiOptions = {}): Promise<Paginated<ProtocolItem>> {
	const response = await publicFetch(`/v1/tenants/${tenant}/projects/${project}/search?q=${encodeURIComponent(query)}`, { signal: options.signal });
	return (await response.json()) as Paginated<ProtocolItem>;
}

function protocolEndpoint(kind: string) {
	const map: Record<string, string> = {
		label: 'labels',
		milestone: 'milestones',
		comment: 'comments',
		hook: 'hooks',
		webhook: 'webhooks',
		release: 'releases',
		key: 'keys',
		ssh_key: 'ssh-keys'
	};
	return map[kind] ?? kind;
}

export async function updateIssueStatus(tenant: string, project: string, issueId: string, status: 'open' | 'closed'): Promise<Issue> {
	return updateIssue(tenant, project, issueId, { status, state: status });
}

export async function listWorkspaceStatuses(tenant: string, project: string, options: ApiOptions = {}): Promise<WorkspaceStatus[]> {
	const response = await publicFetch(`/v1/tenants/${tenant}/projects/${project}/workspaces`, { signal: options.signal });
	const data = (await response.json()) as { workspaces: WorkspaceStatus[] };
	return data.workspaces;
}

export async function getWorkspaceDetail(tenant: string, project: string, workspace: string, options: ApiOptions = {}): Promise<WorkspaceStatus & { history: HistoryEntry[]; files: ProjectTree }> {
	const [statuses, tree, history] = await Promise.all([
		listWorkspaceStatuses(tenant, project, options),
		getProjectTree(tenant, project, workspace, undefined, options),
		getWorkspaceHistory(tenant, project, workspace, options)
	]);
	const status = statuses.find((s) => s.name === workspace);
	return { ...(status ?? statuses[0]), history, files: tree };
}

export async function listReadyWorkspaces(tenant: string, project: string, options: ApiOptions = {}): Promise<WorkspaceStatus[]> {
	const workspaces = await listWorkspaceStatuses(tenant, project, options);
	return workspaces.filter((w) => w.is_ready && w.name !== 'main');
}

export async function getReadyWorkspaceDetail(tenant: string, project: string, workspace: string, options: ApiOptions = {}): Promise<WorkspaceStatus & { comments: Comment[] }> {
	const workspaces = await listReadyWorkspaces(tenant, project, options);
	const ws = workspaces.find((w) => w.name === workspace);
	if (!ws) throw new Error('Workspace not found');
	return { ...ws, comments: [] };
}

export async function mergeWorkspace(tenant: string, project: string, workspace: string) {
	await authedFetch(`/v1/tenants/${tenant}/projects/${project}/workspaces/${workspace}/merge`, {
		method: 'POST'
	});
}

export async function getMergePreview(tenant: string, project: string, workspace: string, options: ApiOptions = {}): Promise<{ path: string; change_type: string }[]> {
	const response = await publicFetch(`/v1/tenants/${tenant}/projects/${project}/workspaces/${encodeURIComponent(workspace)}/merge-preview`, { signal: options.signal });
	const data = (await response.json()) as { files: { path: string; change_type: string }[] };
	return data.files;
}

export async function markWorkspaceReady(tenant: string, project: string, workspace: string) {
	await authedFetch(`/v1/tenants/${tenant}/projects/${project}/workspaces/${workspace}/ready`, {
		method: 'POST'
	});
}

export async function getWorkspaceHistory(tenant: string, project: string, workspace: string, options: ApiOptions = {}): Promise<HistoryEntry[]> {
	const response = await publicFetch(`/v1/tenants/${tenant}/projects/${project}/workspaces/${workspace}/history`, { signal: options.signal });
	const data = (await response.json()) as { entries: HistoryEntry[] };
	return data.entries;
}

export async function getProjectHistory(tenant: string, project: string, options: ApiOptions = {}): Promise<HistoryEntry[]> {
	const response = await publicFetch(`/v1/tenants/${tenant}/projects/${project}/history`, { signal: options.signal });
	const data = (await response.json()) as { entries: HistoryEntry[] };
	return data.entries;
}

export async function getHistoryEntryDetail(tenant: string, project: string, entryId: string, options: ApiOptions = {}): Promise<HistoryEntry & { parent_id: string | null; files: { path: string; change_type: string; old_id: string | null; new_id: string | null }[] }> {
	const entry = await getHistoryEntry(tenant, project, entryId, options);
	if (!entry.snapshot_id) {
		return { ...entry, parent_id: null, files: [] };
	}
	const objects = await downloadObjects(tenant, project, [entry.snapshot_id], options);
	if (objects.length === 0) {
		return { ...entry, parent_id: null, files: [] };
	}
	const snapshot = JSON.parse(atob(objects[0].bytes_base64)) as { parents?: string[]; root_tree?: string };
	const parentId = snapshot.parents?.[0] ?? null;

	const [currentTree, parentTree] = await Promise.all([
		getProjectTree(tenant, project, entry.workspace, entry.snapshot_id, options),
		parentId ? getProjectTree(tenant, project, entry.workspace, parentId, options).catch((error) => {
			if (isAbortError(error)) throw error;
			return null;
		}) : null
	]);

	const currentMap = new Map(currentTree.entries.filter((e) => e.entry_type === 'blob').map((e) => [e.path, e.id]));
	const parentMap = parentId && parentTree
		? new Map(parentTree.entries.filter((e) => e.entry_type === 'blob').map((e) => [e.path, e.id]))
		: new Map<string, string>();

	const files: { path: string; change_type: string; old_id: string | null; new_id: string | null }[] = [];
	for (const [path, id] of currentMap) {
		if (!parentMap.has(path)) {
			files.push({ path, change_type: 'added', old_id: null, new_id: id });
		} else if (parentMap.get(path) !== id) {
			files.push({ path, change_type: 'modified', old_id: parentMap.get(path) ?? null, new_id: id });
		}
	}
	for (const [path, id] of parentMap) {
		if (!currentMap.has(path)) {
			files.push({ path, change_type: 'deleted', old_id: id, new_id: null });
		}
	}
	files.sort((a, b) => a.path.localeCompare(b.path));

	return { ...entry, parent_id: parentId, files };
}

export async function getProjectReadme(tenant: string, project: string, options: ApiOptions = {}): Promise<string | null> {
	try {
		for (const path of ['README.md', 'Readme.md', 'readme.md']) {
			try {
				const file = await getProjectFile(tenant, project, path, 'main', undefined, options);
				if (file.text !== null) return file.text;
			} catch (error) {
				if (isAbortError(error)) throw error;
			}
		}
		return null;
	} catch (error) {
		if (isAbortError(error)) throw error;
		return null;
	}
}

export async function getProjectOverview(tenant: string, project: string, options: ApiOptions = {}): Promise<ProjectOverview> {
	const [detail, issues, workspaces, settings, history] = await Promise.all([
		getProject(tenant, project, options),
		listIssues(tenant, project, options),
		listWorkspaceStatuses(tenant, project, options),
		getProjectSettings(tenant, project, options).catch((error) => {
			if (isAbortError(error)) throw error;
			return null;
		}),
		getProjectHistory(tenant, project, options).catch((error) => {
			if (isAbortError(error)) throw error;
			return [];
		})
	]);
	const recentActivity: Activity[] = history.slice(0, 20).map((h) => ({
		id: h.id,
		kind: h.kind as Activity['kind'],
		actor: h.author,
		message: h.message,
		timestamp: h.timestamp,
		workspace: h.workspace
	}));
	return {
		project: detail.project,
		stats: {
			workspace_count: detail.workspaces.length,
			issue_count: issues.issues.length,
			open_ready_count: workspaces.filter((w) => w.is_ready).length,
			star_count: settings?.starred_count ?? 0
		},
		recent_activity: recentActivity,
		default_workspace: settings?.default_workspace ?? 'main'
	};
}

export async function getProjectSettings(tenant: string, project: string, options: ApiOptions = {}): Promise<ProjectSettings> {
	const response = await authedFetch(`/v1/tenants/${tenant}/projects/${project}/settings`, { signal: options.signal });
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

export async function setParentWorkspace(tenant: string, project: string, workspace: string, parent_workspace: string | null) {
	await authedFetch(`/v1/tenants/${tenant}/projects/${project}/workspaces/${workspace}/parent`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ parent_workspace })
	});
}
