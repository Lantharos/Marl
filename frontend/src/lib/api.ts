import { getStyToken } from './session';
import { authedFetch, notifyProjectSettingsChanged, notifyProjectStatsChanged, pageQuery, publicFetch } from './apiShared';
import type { ApiOptions, PageOptions, Paginated } from './apiShared';
import type { WorkspaceStatus } from './projectDataApi';
import type { AccessResponse, UserProfile } from './collaboratorTypes';
import type { Issue } from './issueApi';
import type { AccountKey, CapabilityResponse, CiArtifact, CiJob, CiLogLine, CiRunner, DeveloperApp, Label, Leaf, LeafDraft, Milestone, ProjectApiKey, ProjectIntegration, ProjectScreenshot, ProjectWebhook, ProjectWebhookDelivery, ProtocolDraft, ProtocolItem, Release, ReleaseArtifact, TagInfo } from './protocolTypes';
export { isAbortError } from './apiShared';
export type { ApiOptions, PageOptions, Paginated } from './apiShared';
export * from './collaboratorApi';
export * from './developerApi';
export type { AccessResponse, Collaborator, CollaboratorRole, UserProfile } from './collaboratorTypes';
export * from './issueApi';
export * from './objectApi';
export * from './projectDataApi';
export type { AccountKey, CapabilityResponse, CiArtifact, CiJob, CiLogLine, CiRunner, DeveloperApp, Label, Leaf, LeafDraft, Milestone, ProjectApiKey, ProjectIntegration, ProjectScreenshot, ProjectWebhook, ProjectWebhookDelivery, ProtocolDraft, ProtocolItem, Release, ReleaseArtifact, TagInfo } from './protocolTypes';

export interface ProjectSummary {
	tenant: string;
	project: string;
	owner?: string;
	folder?: string | null;
}

export interface TenantSummary {
	name: string;
	kind: 'user' | 'org' | string;
	owner?: string;
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
	type: 'text' | 'button' | 'link' | 'info' | 'workspaces' | 'leaves' | 'releases' | 'activity';
	content?: string;
	url?: string;
	button_label?: string;
	enabled: boolean;
	order: number;
}

export interface ProjectAppearance {
	accent_color: string;
	background_color: string;
	surface_color: string;
	foreground_color: string;
	muted_color: string;
	border_color: string;
	nav_background_color: string;
	nav_foreground_color: string;
	nav_muted_color: string;
	primary_color: string;
	primary_foreground_color: string;
	code_background_color: string;
}

export interface ProjectSettings {
	visibility: 'public' | 'private';
	follower_count: number;
	is_following: boolean;
	public_releases: boolean;
	archived_at?: string | null;
	archived_by?: string | null;
	archived_by_profile?: UserProfile | null;
	default_workspace: string;
	appearance: ProjectAppearance;
	navbar_items: NavbarItem[];
	panels: PanelItem[];
	merge_rules: MergeRules;
	protected_workspaces: string[];
	path_visibility: PathVisibilityRule[];
	ci: ProjectCiSettings;
}

export interface PathVisibilityRule {
	path: string;
	visibility: 'public' | 'team' | 'private' | 'local';
}

export interface MergeRules {
	required_approvals: number;
	require_passing_checks: boolean;
	dismiss_stale_approvals: boolean;
	block_unresolved_comments: boolean;
}

export interface ProjectCiSettings {
	enabled: boolean;
	commands: CiCommand[];
	max_concurrent_jobs?: number;
	max_jobs_per_head?: number;
	max_attempts?: number;
	lease_grace_seconds?: number;
	artifact_retention_days?: number;
	cache_retention_days?: number;
}

export interface CiCommand {
	name: string;
	run: string;
	timeout_seconds: number;
	artifacts?: string[];
	cache?: CiCacheEntry[];
}

export interface CiCacheEntry {
	key: string;
	path: string;
}

export interface ProjectStats {
	workspace_count: number;
	open_issue_count: number;
	ready_count: number;
	release_count: number;
	history_count: number;
	leaf_count: number;
}

export interface Activity {
	id: string;
	kind: 'save' | 'ship' | 'pack' | 'issue' | 'ready' | 'merge' | string;
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
	access: AccessResponse;
	readme: string | null;
	stats: {
		workspace_count: number;
		open_issue_count: number;
		ready_count: number;
		release_count: number;
		history_count: number;
		leaf_count: number;
	};
	recent_activity: Activity[];
	releases: Release[];
	featured_screenshot?: ProjectScreenshot | null;
	pinned_leaves?: Leaf[];
	default_workspace: string;
}

export type MeResponse = {
	user: string;
	profile?: UserProfile | null;
	tenants: TenantSummary[];
	settings: UserSettings;
	account_tenant?: string | null;
	account_setup_required?: boolean;
	account_tenant_suggestions?: string[];
};

export interface UserSettings {
	vigilant_mode: boolean;
}

export interface ProjectDiscoveryItem {
	tenant: string;
	project: string;
	owner: string;
	folder?: string | null;
	stats: ProjectStats;
	last_activity_at?: string | null;
	latest_release?: Release | null;
}

export interface TenantFolder {
	tenant: string;
	path: string;
	parent?: string | null;
}

export interface ProjectReleaseFeedItem {
	tenant: string;
	project: string;
	owner: string;
	release: Release;
	released_at: string;
}

export interface HomeReadyWorkspace {
	tenant: string;
	project: string;
	workspace: string;
	head: string | null;
	parent_workspace: string | null;
	mergeable: boolean;
	marked_at: string | null;
	author: string;
	author_profile?: UserProfile | null;
}

export interface HomeIssueItem {
	tenant: string;
	project: string;
	issue: Issue;
}

export interface HomeMentionItem {
	tenant: string;
	project: string;
	issue_id: string;
	issue_number: number;
	issue_title: string;
	source: 'issue' | 'comment' | string;
	author: string;
	author_profile?: UserProfile | null;
	body: string;
	created_at: string;
}

export interface HomeActivityItem {
	tenant: string;
	project: string;
	kind: string;
	title: string;
	detail?: string | null;
	href: string;
	timestamp: string;
	actor?: string | null;
	actor_profile?: UserProfile | null;
	workspace?: string | null;
}

export interface ProfileContributionDay {
	date: string;
	count: number;
}

export interface ProfileTenant {
	name: string;
	kind: string;
	public_project_count: number;
}

export interface ProfileStats {
	public_project_count: number;
	contribution_count: number;
	tenant_count: number;
}

export interface UserProfilePage {
	tenant: string;
	owner: string;
	profile: UserProfile;
	is_self: boolean;
	stats: ProfileStats;
	projects: ProjectDiscoveryItem[];
	pinned_projects: ProjectDiscoveryItem[];
	pin_candidates: ProjectDiscoveryItem[];
	following: ProjectDiscoveryItem[];
	tenants: ProfileTenant[];
	contributions: ProfileContributionDay[];
	activity: HomeActivityItem[];
}

export interface HomeAttention {
	ready_workspaces: HomeReadyWorkspace[];
	assigned_issues: HomeIssueItem[];
	mentions: HomeMentionItem[];
}

export interface HomeResponse {
	projects: ProjectDiscoveryItem[];
	following: ProjectDiscoveryItem[];
	releases: ProjectReleaseFeedItem[];
	discover: ProjectDiscoveryItem[];
	attention: HomeAttention;
	activity: HomeActivityItem[];
	project_activity: HomeActivityItem[];
	followed_activity: HomeActivityItem[];
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
	const me = (await response.json()) as MeResponse;
	return { ...me, settings: me.settings ?? defaultUserSettings() };
}

export async function getInitializedMe(options: ApiOptions = {}) {
	const me = await getMe(options);
	if (!isAccountTenantReady(me)) {
		throw new Error('Account tenant is still initializing');
	}
	return me;
}

function isAccountTenantReady(me: MeResponse) {
	return Boolean(me.account_tenant || me.tenants.some((tenant) => tenant.kind === 'user'));
}

export async function createAccountTenant(name: string) {
	const response = await authedFetch('/v1/account/tenant', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ name })
	});
	return (await response.json()) as TenantSummary;
}

export async function getUserSettings(options: ApiOptions = {}): Promise<UserSettings> {
	const response = await authedFetch('/v1/account/settings', { signal: options.signal });
	const settings = (await response.json()) as UserSettings;
	return { ...defaultUserSettings(), ...settings };
}

export async function updateUserSettings(settings: Partial<UserSettings>): Promise<UserSettings> {
	const response = await authedFetch('/v1/account/settings', {
		method: 'PATCH',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(settings)
	});
	const updated = (await response.json()) as UserSettings;
	return { ...defaultUserSettings(), ...updated };
}

function defaultUserSettings(): UserSettings {
	return { vigilant_mode: false };
}

export async function listProjects(options: ApiOptions = {}) {
	const token = await getStyToken();
	if (!token) {
		return [];
	}
	const response = await authedFetch('/v1/projects', { signal: options.signal });
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

export async function listTenantProjectCards(
	tenant: string,
	query: string,
	options: PageOptions = {}
): Promise<Paginated<ProjectDiscoveryItem>> {
	const params = new URLSearchParams();
	params.set('page', String(options.page ?? 1));
	params.set('per_page', String(options.perPage ?? 30));
	if (query.trim()) params.set('q', query.trim());
	const response = await publicFetch(`/v1/tenants/${tenant}/projects?${params}`, { signal: options.signal });
	return (await response.json()) as Paginated<ProjectDiscoveryItem>;
}

export async function listAccessibleTenantProjectCards(
	tenant: string,
	query: string,
	options: PageOptions = {}
): Promise<Paginated<ProjectDiscoveryItem>> {
	const params = new URLSearchParams();
	params.set('page', String(options.page ?? 1));
	params.set('per_page', String(options.perPage ?? 30));
	if (query.trim()) params.set('q', query.trim());
	const response = await authedFetch(`/v1/tenants/${tenant}/projects?${params}`, { signal: options.signal });
	return (await response.json()) as Paginated<ProjectDiscoveryItem>;
}

export async function listTenantFolders(tenant: string, options: ApiOptions = {}): Promise<TenantFolder[]> {
	const response = await publicFetch(`/v1/tenants/${tenant}/folders`, { signal: options.signal });
	const body = (await response.json()) as { folders: TenantFolder[] };
	return body.folders;
}

export async function listAccessibleTenantFolders(tenant: string, options: ApiOptions = {}): Promise<TenantFolder[]> {
	const response = await authedFetch(`/v1/tenants/${tenant}/folders`, { signal: options.signal });
	const body = (await response.json()) as { folders: TenantFolder[] };
	return body.folders;
}

export async function getUserProfilePage(tenant: string, options: ApiOptions = {}): Promise<UserProfilePage | null> {
	try {
		const response = await publicFetch(`/v1/profiles/${encodeURIComponent(tenant)}`, { signal: options.signal });
		return (await response.json()) as UserProfilePage;
	} catch (error) {
		if (error instanceof Error && error.message.includes('profile not found')) return null;
		throw error;
	}
}

export async function getUserProfilePageByHandle(handle: string, options: ApiOptions = {}): Promise<UserProfilePage | null> {
	try {
		const response = await publicFetch(`/v1/users/${encodeURIComponent(handle)}/profile`, { signal: options.signal });
		return (await response.json()) as UserProfilePage;
	} catch (error) {
		if (error instanceof Error && error.message.includes('profile not found')) return null;
		throw error;
	}
}

export async function updateUserProfilePins(
	tenant: string,
	projects: { tenant: string; project: string }[]
): Promise<UserProfilePage> {
	const response = await authedFetch(`/v1/profiles/${encodeURIComponent(tenant)}/pins`, {
		method: 'PUT',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ projects })
	});
	return (await response.json()) as UserProfilePage;
}

export async function createTenantFolder(tenant: string, path: string): Promise<TenantFolder> {
	const response = await authedFetch(`/v1/tenants/${tenant}/folders`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ path })
	});
	return (await response.json()) as TenantFolder;
}

export async function moveProjectToFolder(tenant: string, project: string, folder: string | null): Promise<ProjectSummary> {
	const response = await authedFetch(`/v1/tenants/${tenant}/projects/${project}/folder`, {
		method: 'PATCH',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ folder })
	});
	return (await response.json()) as ProjectSummary;
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

export async function deleteProject(tenant: string, project: string) {
	await authedFetch(`/v1/tenants/${tenant}/projects/${project}`, { method: 'DELETE' });
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

export async function listProjectLeavesPage(tenant: string, project: string, options: PageOptions = {}): Promise<Paginated<Leaf>> {
	const response = await publicFetch(`/v1/tenants/${tenant}/projects/${project}/leaves${pageQuery(options)}`, { signal: options.signal });
	return (await response.json()) as Paginated<Leaf>;
}

export async function getProjectLeaf(tenant: string, project: string, leaf: string, options: ApiOptions = {}): Promise<Leaf> {
	const response = await publicFetch(`/v1/tenants/${tenant}/projects/${project}/leaves/${encodeURIComponent(leaf)}`, { signal: options.signal });
	return (await response.json()) as Leaf;
}

export async function createProjectLeaf(tenant: string, project: string, leaf: LeafDraft): Promise<Leaf> {
	const response = await authedFetch(`/v1/tenants/${tenant}/projects/${project}/leaves`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(leaf)
	});
	notifyProjectStatsChanged(tenant, project);
	return (await response.json()) as Leaf;
}

export async function updateProjectLeaf(tenant: string, project: string, leafId: string, leaf: LeafDraft): Promise<Leaf> {
	const response = await authedFetch(`/v1/tenants/${tenant}/projects/${project}/leaves/${encodeURIComponent(leafId)}`, {
		method: 'PATCH',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(leaf)
	});
	notifyProjectStatsChanged(tenant, project);
	return (await response.json()) as Leaf;
}

export async function deleteProjectLeaf(tenant: string, project: string, leafId: string): Promise<void> {
	await authedFetch(`/v1/tenants/${tenant}/projects/${project}/leaves/${encodeURIComponent(leafId)}`, { method: 'DELETE' });
	notifyProjectStatsChanged(tenant, project);
}

export async function listTenantLeavesPage(tenant: string, options: PageOptions = {}): Promise<Paginated<Leaf>> {
	const response = await publicFetch(`/v1/tenants/${tenant}/leaves${pageQuery(options)}`, { signal: options.signal });
	return (await response.json()) as Paginated<Leaf>;
}

export async function createTenantLeaf(tenant: string, leaf: LeafDraft): Promise<Leaf> {
	const response = await authedFetch(`/v1/tenants/${tenant}/leaves`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(leaf)
	});
	return (await response.json()) as Leaf;
}

export async function getTenantLeaf(tenant: string, leaf: string, options: ApiOptions = {}): Promise<Leaf> {
	const response = await publicFetch(`/v1/tenants/${tenant}/leaves/${encodeURIComponent(leaf)}`, { signal: options.signal });
	return (await response.json()) as Leaf;
}

export async function updateTenantLeaf(tenant: string, leafId: string, leaf: LeafDraft): Promise<Leaf> {
	const response = await authedFetch(`/v1/tenants/${tenant}/leaves/${encodeURIComponent(leafId)}`, {
		method: 'PATCH',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(leaf)
	});
	return (await response.json()) as Leaf;
}

export async function deleteTenantLeaf(tenant: string, leafId: string): Promise<void> {
	await authedFetch(`/v1/tenants/${tenant}/leaves/${encodeURIComponent(leafId)}`, { method: 'DELETE' });
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

export async function getRelease(tenant: string, project: string, releaseId: string, options: ApiOptions = {}): Promise<Release> {
	const response = await publicFetch(`/v1/tenants/${tenant}/projects/${project}/releases/${encodeURIComponent(releaseId)}`, { signal: options.signal });
	return (await response.json()) as Release;
}

export async function updateRelease(tenant: string, project: string, releaseId: string, release: Partial<Release>): Promise<Release> {
	const response = await authedFetch(`/v1/tenants/${tenant}/projects/${project}/releases/${encodeURIComponent(releaseId)}`, {
		method: 'PATCH',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(release)
	});
	const item = (await response.json()) as Release;
	notifyProjectStatsChanged(tenant, project);
	return item;
}

export async function deleteRelease(tenant: string, project: string, releaseId: string): Promise<void> {
	await authedFetch(`/v1/tenants/${tenant}/projects/${project}/releases/${encodeURIComponent(releaseId)}`, { method: 'DELETE' });
	notifyProjectStatsChanged(tenant, project);
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

export async function listProjectScreenshots(tenant: string, project: string, options: PageOptions = {}): Promise<Paginated<ProjectScreenshot>> {
	const response = await publicFetch(`/v1/tenants/${tenant}/projects/${project}/screenshots${pageQuery(options)}`, { signal: options.signal });
	return (await response.json()) as Paginated<ProjectScreenshot>;
}

export async function uploadProjectScreenshot(tenant: string, project: string, file: File, title?: string, featured = false): Promise<ProjectScreenshot> {
	const form = new FormData();
	form.set('file', file);
	if (title?.trim()) form.set('title', title.trim());
	if (featured) form.set('featured', 'true');
	const response = await authedFetch(`/v1/tenants/${tenant}/projects/${project}/screenshots`, {
		method: 'POST',
		body: form
	});
	return (await response.json()) as ProjectScreenshot;
}

export async function featureProjectScreenshot(tenant: string, project: string, id: string): Promise<ProjectScreenshot> {
	const response = await authedFetch(`/v1/tenants/${tenant}/projects/${project}/screenshots/${encodeURIComponent(id)}/feature`, { method: 'POST' });
	return (await response.json()) as ProjectScreenshot;
}

export async function deleteProjectScreenshot(tenant: string, project: string, id: string) {
	await authedFetch(`/v1/tenants/${tenant}/projects/${project}/screenshots/${encodeURIComponent(id)}`, { method: 'DELETE' });
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
	const response = await publicFetch(`/v1/tenants/${tenant}/projects/${project}/settings`, { signal: options.signal });
	return (await response.json()) as ProjectSettings;
}

export async function getProjectStats(tenant: string, project: string, options: ApiOptions = {}): Promise<ProjectStats> {
	const response = await publicFetch(`/v1/tenants/${tenant}/projects/${project}/stats`, { signal: options.signal });
	return (await response.json()) as ProjectStats;
}

export async function updateProjectSettings(tenant: string, project: string, settings: Partial<ProjectSettings> & { archived?: boolean }) {
	const response = await authedFetch(`/v1/tenants/${tenant}/projects/${project}/settings`, {
		method: 'PATCH',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(settings)
	});
	const updated = (await response.json()) as ProjectSettings;
	notifyProjectSettingsChanged(tenant, project, updated);
	return updated;
}

export async function listCiRunners(tenant: string, project: string, options: PageOptions = {}): Promise<Paginated<CiRunner>> {
	const response = await authedFetch(`/v1/tenants/${tenant}/projects/${project}/ci/runners${pageQuery(options)}`, {
		signal: options.signal
	});
	return (await response.json()) as Paginated<CiRunner>;
}

export async function createCiRunner(tenant: string, project: string, name: string, concurrency = 1): Promise<CiRunner> {
	const response = await authedFetch(`/v1/tenants/${tenant}/projects/${project}/ci/runners`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ name, concurrency })
	});
	return (await response.json()) as CiRunner;
}

export async function deleteCiRunner(tenant: string, project: string, id: string): Promise<void> {
	await authedFetch(`/v1/tenants/${tenant}/projects/${project}/ci/runners/${encodeURIComponent(id)}`, {
		method: 'DELETE'
	});
}

export async function listCiJobs(tenant: string, project: string, options: PageOptions & { workspace?: string } = {}): Promise<Paginated<CiJob>> {
	const params = new URLSearchParams(pageQuery(options).replace(/^\?/, ''));
	if (options.workspace) params.set('workspace', options.workspace);
	const query = params.toString();
	const response = await authedFetch(`/v1/tenants/${tenant}/projects/${project}/ci/jobs${query ? `?${query}` : ''}`, {
		signal: options.signal
	});
	return (await response.json()) as Paginated<CiJob>;
}

export async function getCiJobLogs(tenant: string, project: string, jobId: string, options: ApiOptions = {}): Promise<CiLogLine[]> {
	const response = await authedFetch(`/v1/tenants/${tenant}/projects/${project}/ci/jobs/${encodeURIComponent(jobId)}/logs`, {
		signal: options.signal
	});
	const data = (await response.json()) as { logs: CiLogLine[] };
	return data.logs;
}

export async function listCiJobArtifacts(tenant: string, project: string, jobId: string, options: ApiOptions = {}): Promise<CiArtifact[]> {
	const response = await authedFetch(`/v1/tenants/${tenant}/projects/${project}/ci/jobs/${encodeURIComponent(jobId)}/artifacts`, {
		signal: options.signal
	});
	const data = (await response.json()) as { artifacts: CiArtifact[] };
	return data.artifacts;
}

export async function downloadCiJobArtifact(
	tenant: string,
	project: string,
	jobId: string,
	artifactId: string,
	options: ApiOptions = {}
): Promise<{ blob: Blob; filename?: string }> {
	const response = await authedFetch(`/v1/tenants/${tenant}/projects/${project}/ci/jobs/${encodeURIComponent(jobId)}/artifacts/${encodeURIComponent(artifactId)}/download`, {
		signal: options.signal
	});
	return {
		blob: await response.blob(),
		filename: contentDispositionFilename(response.headers.get('content-disposition'))
	};
}

function contentDispositionFilename(value: string | null) {
	if (!value) return undefined;
	for (const part of value.split(';')) {
		const filename = part.trim().match(/^filename="?([^"]+)"?$/)?.[1]?.trim();
		if (filename && !filename.includes('/') && !filename.includes('\\')) return filename;
	}
	return undefined;
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
