import { apiBase, getStyToken } from './session';
import { authedFetch, notifyProjectStatsChanged, pageQuery, publicFetch } from './apiShared';
import type { ApiOptions, PageOptions, Paginated } from './apiShared';
import type { WorkspaceStatus } from './projectDataApi';
import type { AccountKey, CapabilityResponse, Label, Milestone, ProtocolDraft, ProtocolItem, Release, ReleaseArtifact, TagInfo } from './protocolTypes';
export { isAbortError } from './apiShared';
export type { ApiOptions, PageOptions, Paginated } from './apiShared';
export * from './issueApi';
export * from './objectApi';
export * from './projectDataApi';
export type { AccountKey, CapabilityResponse, Label, Milestone, ProtocolDraft, ProtocolItem, Release, ReleaseArtifact, TagInfo } from './protocolTypes';

export interface ProjectSummary {
	tenant: string;
	project: string;
}

export interface TenantSummary {
	name: string;
	kind: 'user' | 'org' | string;
}

export interface UserProfile {
	user: string;
	display_name: string;
	handle?: string | null;
	avatar_url?: string | null;
	email?: string | null;
	updated_at?: string | null;
}

export interface WorkspaceSummary {
	name: string;
	head: string | null;
}

export interface ProjectDetail {
	project: ProjectSummary;
	workspaces: WorkspaceSummary[];
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
	type: 'text' | 'button' | 'link' | 'info' | 'workspaces' | 'releases' | 'activity';
	content?: string;
	url?: string;
	button_label?: string;
	enabled: boolean;
	order: number;
}

export interface ProjectSettings {
	visibility: 'public' | 'private';
	follower_count: number;
	is_following: boolean;
	default_workspace: string;
	navbar_items: NavbarItem[];
	panels: PanelItem[];
}

export interface ProjectStats {
	workspace_count: number;
	open_issue_count: number;
	ready_count: number;
	release_count: number;
	history_count: number;
}

export interface Activity {
	id: string;
	kind: 'save' | 'ship' | 'cram' | 'issue' | 'ready' | 'merge';
	actor: string;
	actor_profile?: UserProfile | null;
	message: string;
	timestamp: string;
	workspace?: string;
}

export interface ProjectOverview {
	project: ProjectSummary;
	workspaces: WorkspaceStatus[];
	settings: ProjectSettings;
	readme: string | null;
	stats: {
		workspace_count: number;
		open_issue_count: number;
		ready_count: number;
		release_count: number;
		history_count: number;
	};
	recent_activity: Activity[];
	releases: Release[];
	default_workspace: string;
}

export type MeResponse = { user: string; profile?: UserProfile | null; tenants: TenantSummary[] };

export interface ProjectDiscoveryItem {
	tenant: string;
	project: string;
	owner: string;
	stats: ProjectStats;
	last_activity_at?: string | null;
	latest_release?: Release | null;
}

export interface ProjectReleaseFeedItem {
	tenant: string;
	project: string;
	owner: string;
	release: Release;
	released_at: string;
}

export interface HomeResponse {
	projects: ProjectDiscoveryItem[];
	following: ProjectDiscoveryItem[];
	releases: ProjectReleaseFeedItem[];
	discover: ProjectDiscoveryItem[];
}

export interface FollowResponse {
	is_following: boolean;
	can_follow: boolean;
}

export interface RemoteApproval {
	id: string;
	action: string;
	summary: string;
	status: 'pending' | 'approved' | 'consumed' | 'denied' | 'expired' | string;
	expires_at: string;
	approved_at?: string | null;
}

export async function getMe(options: ApiOptions = {}) {
	const response = await authedFetch('/v1/me', { signal: options.signal });
	return (await response.json()) as MeResponse;
}

export async function getInitializedMe(options: ApiOptions = {}) {
	const me = await getMe(options);
	if (!isAccountTenantReady(me)) {
		throw new Error('Account tenant is still initializing');
	}
	return me;
}

function isAccountTenantReady(me: MeResponse) {
	const handle = me.profile?.handle?.trim();
	return Boolean(handle && me.tenants.some((tenant) => tenant.kind === 'user' && tenant.name === handle));
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

export async function getHome(options: ApiOptions = {}): Promise<HomeResponse> {
	const response = await authedFetch('/v1/home', { signal: options.signal });
	return (await response.json()) as HomeResponse;
}

export async function discoverProjects(query: string, options: PageOptions = {}): Promise<Paginated<ProjectDiscoveryItem>> {
	const params = new URLSearchParams();
	if (query.trim()) params.set('q', query.trim());
	const paging = pageQuery(options).replace(/^\?/, '');
	if (paging) {
		for (const [key, value] of new URLSearchParams(paging)) {
			params.set(key, value);
		}
	}
	const value = params.toString();
	const response = await publicFetch(`/v1/discover/projects${value ? `?${value}` : ''}`, { signal: options.signal });
	return (await response.json()) as Paginated<ProjectDiscoveryItem>;
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

export async function getProject(tenant: string, project: string, options: ApiOptions = {}) {
	const response = await publicFetch(`/v1/tenants/${tenant}/projects/${project}`, { signal: options.signal });
	return (await response.json()) as ProjectDetail;
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
	const item = (await response.json()) as Release;
	notifyProjectStatsChanged(tenant, project);
	return item;
}

export async function uploadReleaseArtifact(tenant: string, project: string, releaseId: string, file: File): Promise<Release> {
	const form = new FormData();
	form.set('file', file);
	const response = await authedFetch(`/v1/tenants/${tenant}/projects/${project}/releases/${encodeURIComponent(releaseId)}/artifacts`, {
		method: 'POST',
		body: form
	});
	const item = (await response.json()) as Release;
	notifyProjectStatsChanged(tenant, project);
	return item;
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

export async function listAccountKeys(kind: 'signing_key' | 'ssh_key', options: PageOptions = {}): Promise<Paginated<AccountKey>> {
	const endpoint = kind === 'ssh_key' ? 'ssh-keys' : 'keys';
	const response = await authedFetch(`/v1/account/${endpoint}${pageQuery(options)}`, { signal: options.signal });
	return (await response.json()) as Paginated<AccountKey>;
}

export async function createAccountKey(kind: 'signing_key' | 'ssh_key', item: { name: string; public_key?: string; key?: string; algorithm?: string }): Promise<AccountKey> {
	const endpoint = kind === 'ssh_key' ? 'ssh-keys' : 'keys';
	const response = await authedFetch(`/v1/account/${endpoint}`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(item)
	});
	return (await response.json()) as AccountKey;
}

export async function deleteAccountKey(kind: 'signing_key' | 'ssh_key', id: string) {
	const endpoint = kind === 'ssh_key' ? 'ssh-keys' : 'keys';
	await authedFetch(`/v1/account/${endpoint}/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export async function getRemoteApproval(id: string): Promise<RemoteApproval> {
	const response = await authedFetch(`/v1/remote-approvals/${encodeURIComponent(id)}`);
	return (await response.json()) as RemoteApproval;
}

export async function approveRemoteApproval(id: string): Promise<RemoteApproval> {
	const response = await authedFetch(`/v1/remote-approvals/${encodeURIComponent(id)}/approve`, {
		method: 'POST'
	});
	return (await response.json()) as RemoteApproval;
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
	if (kind === 'release') notifyProjectStatsChanged(tenant, project);
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

export async function getProjectOverview(tenant: string, project: string, options: ApiOptions = {}): Promise<ProjectOverview> {
	const response = await publicFetch(`/v1/tenants/${tenant}/projects/${project}/overview`, { signal: options.signal });
	return (await response.json()) as ProjectOverview;
}

export async function getProjectSettings(tenant: string, project: string, options: ApiOptions = {}): Promise<ProjectSettings> {
	const response = await authedFetch(`/v1/tenants/${tenant}/projects/${project}/settings`, { signal: options.signal });
	return (await response.json()) as ProjectSettings;
}

export async function getProjectStats(tenant: string, project: string, options: ApiOptions = {}): Promise<ProjectStats> {
	const response = await publicFetch(`/v1/tenants/${tenant}/projects/${project}/stats`, { signal: options.signal });
	return (await response.json()) as ProjectStats;
}

export async function updateProjectSettings(tenant: string, project: string, settings: Partial<ProjectSettings>) {
	const response = await authedFetch(`/v1/tenants/${tenant}/projects/${project}/settings`, {
		method: 'PATCH',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(settings)
	});
	return (await response.json()) as ProjectSettings;
}

export async function getProjectFollow(tenant: string, project: string, options: ApiOptions = {}): Promise<FollowResponse> {
	const response = await authedFetch(`/v1/tenants/${tenant}/projects/${project}/follow`, { signal: options.signal });
	return (await response.json()) as FollowResponse;
}

export async function followProject(tenant: string, project: string): Promise<FollowResponse> {
	const response = await authedFetch(`/v1/tenants/${tenant}/projects/${project}/follow`, { method: 'POST' });
	return (await response.json()) as FollowResponse;
}

export async function unfollowProject(tenant: string, project: string): Promise<FollowResponse> {
	const response = await authedFetch(`/v1/tenants/${tenant}/projects/${project}/follow`, { method: 'DELETE' });
	return (await response.json()) as FollowResponse;
}

export async function setParentWorkspace(tenant: string, project: string, workspace: string, parent_workspace: string | null) {
	await authedFetch(`/v1/tenants/${tenant}/projects/${project}/workspaces/${workspace}/parent`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ parent_workspace })
	});
}
