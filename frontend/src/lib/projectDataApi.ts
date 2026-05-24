import {
	authedFetch,
	isAbortError,
	notifyProjectStatsChanged,
	pageQuery,
	publicFetch,
	type ApiOptions
} from './apiShared';
import type { PageOptions, Paginated } from './apiShared';
import type { Comment } from './issueApi';
import { downloadObjects } from './objectApi';
import type { UserProfile } from './api';

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
	prefix?: string | null;
	next_cursor?: string | null;
	truncated?: boolean;
}

export interface ProjectTreeOptions extends ApiOptions {
	path?: string;
	prefix?: string;
	cursor?: string;
	depth?: number;
	limit?: number;
}

export interface ProjectFile {
	path: string;
	id: string;
	text: string | null;
	binary: boolean;
}

export interface WorkspaceStatus {
	name: string;
	head: string | null;
	status: 'draft' | 'ready' | 'merged' | string;
	parent_workspace: string | null;
	visibility: 'private' | 'team' | 'public' | string;
	created_by?: string | null;
	last_activity_at?: string | null;
	labels: string[];
	reviewers: string[];
	assignees: string[];
	milestone?: string | null;
	linked_issues: string[];
	locked: boolean;
	changed_file_count: number;
	additions: number;
	deletions: number;
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
	kind: 'save' | 'ship' | 'pack' | 'merge' | 'ready' | string;
	message: string;
	author: string;
	author_profile?: UserProfile | null;
	timestamp: string;
	workspace: string;
	snapshot_id: string | null;
	agent?: string;
	model?: string;
	tool?: string;
	signature?: {
		user: string;
		key_id: string;
		algorithm: string;
	} | null;
}

export interface ChangedFile {
	path: string;
	change_type: string;
	old_id: string | null;
	new_id: string | null;
}

export interface ReviewComment {
	id: string;
	kind: 'comment' | string;
	body: string;
	author: string;
	author_profile?: UserProfile | null;
	created_at: string;
	updated_at?: string;
	target_type: 'workspace' | 'save' | 'file' | 'line' | string;
	target_id?: string;
	workspace?: string;
	snapshot_id?: string | null;
	history_entry_id?: string;
	file?: string | null;
	line?: number | null;
	start_line?: number | null;
	end_line?: number | null;
	side?: 'old' | 'new' | string;
	state?: 'open' | 'resolved' | string;
}

export interface WorkspaceReview {
	id: string;
	workspace: string;
	author: string;
	author_profile?: UserProfile | null;
	state: 'approved' | 'changes_requested' | 'commented' | string;
	body?: string | null;
	head?: string | null;
	submitted_at: string;
}

export interface WorkspaceCheck {
	id: string;
	workspace: string;
	head?: string | null;
	name: string;
	status: 'queued' | 'in_progress' | 'completed' | string;
	conclusion?: string | null;
	summary?: string | null;
	details_url?: string | null;
	created_at: string;
	updated_at: string;
}

export interface WorkspaceCheckSummary {
	state: 'not_configured' | 'pending' | 'passing' | 'failing' | string;
	total: number;
	passing: number;
	failing: number;
	pending: number;
}

export interface AuditEvent {
	id: string;
	actor: string;
	action: string;
	target_type: string;
	target_id: string;
	metadata: Record<string, unknown>;
	created_at: string;
}

export interface NotificationItem {
	id: string;
	tenant: string;
	project: string;
	kind: string;
	title: string;
	body: string;
	href: string;
	read_at?: string | null;
	created_at: string;
}

export interface ReviewCommentTarget {
	target_type: ReviewComment['target_type'];
	target_id?: string;
	workspace?: string;
	snapshot_id?: string | null;
	history_entry_id?: string;
	file?: string | null;
	line?: number | null;
	start_line?: number | null;
	end_line?: number | null;
	side?: 'old' | 'new' | string;
}

export async function getProjectTree(tenant: string, project: string, workspace = 'main', snapshot?: string, options: ProjectTreeOptions = {}) {
	let url = `/v1/tenants/${tenant}/projects/${project}/tree?workspace=${encodeURIComponent(workspace)}`;
	if (snapshot) url += `&snapshot=${encodeURIComponent(snapshot)}`;
	if (options.path) url += `&path=${encodeURIComponent(options.path)}`;
	if (options.prefix) url += `&prefix=${encodeURIComponent(options.prefix)}`;
	if (options.cursor) url += `&cursor=${encodeURIComponent(options.cursor)}`;
	if (options.depth !== undefined) url += `&depth=${encodeURIComponent(String(options.depth))}`;
	if (options.limit !== undefined) url += `&limit=${encodeURIComponent(String(options.limit))}`;
	const response = await publicFetch(url, { signal: options.signal });
	return (await response.json()) as ProjectTree;
}

export async function getProjectFile(tenant: string, project: string, path: string, workspace = 'main', snapshot?: string, options: ApiOptions = {}) {
	let url = `/v1/tenants/${tenant}/projects/${project}/files?path=${encodeURIComponent(path)}&workspace=${encodeURIComponent(workspace)}`;
	if (snapshot) url += `&snapshot=${encodeURIComponent(snapshot)}`;
	const response = await publicFetch(url, { signal: options.signal });
	return (await response.json()) as ProjectFile;
}

export async function downloadProjectSource(tenant: string, project: string, workspace = 'main', snapshot?: string, options: ApiOptions = {}) {
	let url = `/v1/tenants/${tenant}/projects/${project}/source.zip?workspace=${encodeURIComponent(workspace)}`;
	if (snapshot) url += `&snapshot=${encodeURIComponent(snapshot)}`;
	return publicFetch(url, { signal: options.signal });
}

export async function getHistoryEntry(tenant: string, project: string, entryId: string, options: ApiOptions = {}): Promise<HistoryEntry> {
	const response = await publicFetch(`/v1/tenants/${tenant}/projects/${project}/history/${encodeURIComponent(entryId)}`, { signal: options.signal });
	return (await response.json()) as HistoryEntry;
}

export async function listWorkspaceStatuses(tenant: string, project: string, options: ApiOptions = {}): Promise<WorkspaceStatus[]> {
	const response = await publicFetch(`/v1/tenants/${tenant}/projects/${project}/workspaces`, { signal: options.signal });
	const data = (await response.json()) as { workspaces: WorkspaceStatus[] };
	return data.workspaces;
}

export async function getWorkspaceDetail(tenant: string, project: string, workspace: string, options: ApiOptions = {}): Promise<WorkspaceStatus & { history: HistoryEntry[] }> {
	const [statuses, history] = await Promise.all([
		listWorkspaceStatuses(tenant, project, options),
		getWorkspaceHistory(tenant, project, workspace, options)
	]);
	const status = statuses.find((s) => s.name === workspace);
	if (!status) throw new Error('Workspace not found');
	return { ...status, history };
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

export async function listReviewComments(
	tenant: string,
	project: string,
	target: Partial<ReviewCommentTarget> = {},
	options: PageOptions = {}
): Promise<Paginated<ReviewComment>> {
	const params = new URLSearchParams(pageQuery(options).replace(/^\?/, ''));
	for (const [key, value] of Object.entries(target)) {
		if (value !== undefined && value !== null && String(value).trim() !== '') {
			params.set(key, String(value));
		}
	}
	const query = params.toString();
	const response = await publicFetch(`/v1/tenants/${tenant}/projects/${project}/comments${query ? `?${query}` : ''}`, {
		signal: options.signal
	});
	return (await response.json()) as Paginated<ReviewComment>;
}

export async function createReviewComment(
	tenant: string,
	project: string,
	target: ReviewCommentTarget,
	body: string
): Promise<ReviewComment> {
	const response = await authedFetch(`/v1/tenants/${tenant}/projects/${project}/comments`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({
			...target,
			body,
			state: 'open',
			target_id: target.target_id ?? reviewTargetId(target)
		})
	});
	return (await response.json()) as ReviewComment;
}

export async function updateReviewComment(
	tenant: string,
	project: string,
	commentId: string,
	body: string,
	state?: 'open' | 'resolved'
): Promise<ReviewComment> {
	const response = await authedFetch(`/v1/tenants/${tenant}/projects/${project}/comments/${encodeURIComponent(commentId)}`, {
		method: 'PATCH',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ body, state })
	});
	return (await response.json()) as ReviewComment;
}

export async function updateReviewCommentState(
	tenant: string,
	project: string,
	commentId: string,
	state: 'open' | 'resolved'
): Promise<ReviewComment> {
	const response = await authedFetch(`/v1/tenants/${tenant}/projects/${project}/comments/${encodeURIComponent(commentId)}`, {
		method: 'PATCH',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ state })
	});
	return (await response.json()) as ReviewComment;
}

export async function deleteReviewComment(tenant: string, project: string, commentId: string) {
	await authedFetch(`/v1/tenants/${tenant}/projects/${project}/comments/${encodeURIComponent(commentId)}`, {
		method: 'DELETE'
	});
}

export async function submitWorkspaceReview(
	tenant: string,
	project: string,
	workspace: string,
	state: 'comment' | 'approve' | 'request_changes',
	body = ''
): Promise<WorkspaceReview> {
	const response = await authedFetch(`/v1/tenants/${tenant}/projects/${project}/workspaces/${encodeURIComponent(workspace)}/reviews`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ state, body })
	});
	return (await response.json()) as WorkspaceReview;
}

export async function listWorkspaceChecks(
	tenant: string,
	project: string,
	workspace: string,
	options: ApiOptions & { head?: string } = {}
): Promise<{ checks: WorkspaceCheck[]; summary: WorkspaceCheckSummary }> {
	let url = `/v1/tenants/${tenant}/projects/${project}/workspaces/${encodeURIComponent(workspace)}/checks`;
	if (options.head) url += `?head=${encodeURIComponent(options.head)}`;
	const response = await publicFetch(url, { signal: options.signal });
	return (await response.json()) as { checks: WorkspaceCheck[]; summary: WorkspaceCheckSummary };
}

export async function submitWorkspaceCheck(
	tenant: string,
	project: string,
	workspace: string,
	check: Partial<WorkspaceCheck> & { name: string; status?: string }
): Promise<WorkspaceCheck> {
	const response = await authedFetch(`/v1/tenants/${tenant}/projects/${project}/workspaces/${encodeURIComponent(workspace)}/checks`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(check)
	});
	return (await response.json()) as WorkspaceCheck;
}

export async function listProjectAuditLog(tenant: string, project: string, options: PageOptions = {}): Promise<Paginated<AuditEvent>> {
	const response = await authedFetch(`/v1/tenants/${tenant}/projects/${project}/audit-log${pageQuery(options)}`, {
		signal: options.signal
	});
	return (await response.json()) as Paginated<AuditEvent>;
}

export async function listNotifications(options: PageOptions = {}): Promise<Paginated<NotificationItem>> {
	const response = await authedFetch(`/v1/notifications${pageQuery(options)}`, { signal: options.signal });
	return (await response.json()) as Paginated<NotificationItem>;
}

export async function markNotificationRead(id: string): Promise<void> {
	await authedFetch(`/v1/notifications/${encodeURIComponent(id)}/read`, { method: 'POST' });
}

export async function requestWorkspaceChanges(tenant: string, project: string, workspace: string, reason: string) {
	await authedFetch(`/v1/tenants/${tenant}/projects/${project}/workspaces/${encodeURIComponent(workspace)}/reject`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ reason })
	});
	notifyProjectStatsChanged(tenant, project);
}

export async function closeWorkspace(tenant: string, project: string, workspace: string, status: 'closed' | 'not_planned', reason: string) {
	await authedFetch(`/v1/tenants/${tenant}/projects/${project}/workspaces/${encodeURIComponent(workspace)}/close`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ status, reason })
	});
	notifyProjectStatsChanged(tenant, project);
}

export async function reopenWorkspace(tenant: string, project: string, workspace: string, reason = '') {
	await authedFetch(`/v1/tenants/${tenant}/projects/${project}/workspaces/${encodeURIComponent(workspace)}/reopen`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ reason })
	});
	notifyProjectStatsChanged(tenant, project);
}

export async function deleteDraftWorkspace(tenant: string, project: string, workspace: string) {
	await authedFetch(`/v1/tenants/${tenant}/projects/${project}/workspaces/${encodeURIComponent(workspace)}`, {
		method: 'DELETE'
	});
	notifyProjectStatsChanged(tenant, project);
}

export async function updateWorkspaceLabels(tenant: string, project: string, workspace: string, labels: string[]) {
	const response = await authedFetch(`/v1/tenants/${tenant}/projects/${project}/workspaces/${encodeURIComponent(workspace)}/labels`, {
		method: 'PATCH',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ labels })
	});
	return (await response.json()) as { labels: string[] };
}

export async function updateWorkspaceMetadata(
	tenant: string,
	project: string,
	workspace: string,
	metadata: Partial<Pick<WorkspaceStatus, 'reviewers' | 'assignees' | 'milestone' | 'linked_issues' | 'locked' | 'visibility'>>
) {
	const response = await authedFetch(`/v1/tenants/${tenant}/projects/${project}/workspaces/${encodeURIComponent(workspace)}/metadata`, {
		method: 'PATCH',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(metadata)
	});
	return (await response.json()) as Pick<WorkspaceStatus, 'reviewers' | 'assignees' | 'milestone' | 'linked_issues' | 'locked' | 'visibility'>;
}

export async function getWorkspaceMergePreview(tenant: string, project: string, workspace: string, options: ApiOptions = {}) {
	const response = await publicFetch(`/v1/tenants/${tenant}/projects/${project}/workspaces/${encodeURIComponent(workspace)}/merge-preview`, {
		signal: options.signal
	});
	return (await response.json()) as { files: ChangedFile[] };
}

function reviewTargetId(target: ReviewCommentTarget) {
	return [
		target.target_type,
		target.workspace,
		target.snapshot_id,
		target.history_entry_id,
		target.file,
		target.side,
		target.start_line ?? target.line,
		target.end_line
	]
		.filter((value) => value !== undefined && value !== null && String(value).trim() !== '')
		.map(String)
		.join(':');
}

export async function mergeWorkspace(tenant: string, project: string, workspace: string) {
	await authedFetch(`/v1/tenants/${tenant}/projects/${project}/workspaces/${workspace}/merge`, {
		method: 'POST'
	});
	notifyProjectStatsChanged(tenant, project);
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
	notifyProjectStatsChanged(tenant, project);
}

export async function getWorkspaceHistory(tenant: string, project: string, workspace: string, options: ApiOptions = {}): Promise<HistoryEntry[]> {
	const response = await publicFetch(`/v1/tenants/${tenant}/projects/${project}/workspaces/${workspace}/history?limit=500`, { signal: options.signal });
	const data = (await response.json()) as { entries: HistoryEntry[] };
	return data.entries;
}

export async function getProjectHistory(tenant: string, project: string, options: ApiOptions & { limit?: number } = {}): Promise<HistoryEntry[]> {
	const limit = options.limit ?? 500;
	const response = await publicFetch(`/v1/tenants/${tenant}/projects/${project}/history?limit=${encodeURIComponent(String(limit))}`, { signal: options.signal });
	const data = (await response.json()) as { entries: HistoryEntry[] };
	return data.entries;
}

export async function getHistoryEntryDetail(
	tenant: string,
	project: string,
	entryId: string,
	options: ApiOptions = {}
): Promise<HistoryEntry & { parent_id: string | null; files: ChangedFile[] }> {
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

	const files: ChangedFile[] = [];
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
