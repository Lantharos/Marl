import {
	authedFetch,
	isAbortError,
	notifyProjectStatsChanged,
	publicFetch,
	type ApiOptions
} from './apiShared';
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

export async function getHistoryEntry(tenant: string, project: string, entryId: string, options: ApiOptions = {}): Promise<HistoryEntry> {
	const response = await publicFetch(`/v1/tenants/${tenant}/projects/${project}/history/${encodeURIComponent(entryId)}`, { signal: options.signal });
	return (await response.json()) as HistoryEntry;
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
	const response = await publicFetch(`/v1/tenants/${tenant}/projects/${project}/workspaces/${workspace}/history`, { signal: options.signal });
	const data = (await response.json()) as { entries: HistoryEntry[] };
	return data.entries;
}

export async function getProjectHistory(tenant: string, project: string, options: ApiOptions = {}): Promise<HistoryEntry[]> {
	const response = await publicFetch(`/v1/tenants/${tenant}/projects/${project}/history`, { signal: options.signal });
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
