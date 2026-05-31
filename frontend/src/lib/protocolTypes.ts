export interface CapabilityResponse {
	version: string;
	capabilities: string[];
	frontend_url?: string | null;
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

export interface AccountKey {
	id: string;
	user: string;
	kind: 'signing_key' | 'ssh_key' | string;
	name: string;
	public_key: string;
	fingerprint: string;
	algorithm: string;
	created_at: string;
	revoked_at?: string | null;
}

export interface Label {
	id?: string;
	name: string;
	color: string;
	description?: string | null;
}

export interface Leaf {
	id: string;
	tenant: string;
	project?: string | null;
	slug: string;
	title: string;
	body: string;
	visibility: 'private' | 'tenant' | 'public' | string;
	attached_type: 'tenant' | 'project' | 'branch' | 'commit' | 'issue' | 'workspace' | 'release' | string;
	attached_id?: string | null;
	tags: string[];
	pinned: boolean;
	author: string;
	author_profile?: import('./collaboratorTypes').UserProfile | null;
	created_at: string;
	updated_at: string;
	href: string;
}

export type LeafDraft = Partial<
	Pick<Leaf, 'slug' | 'title' | 'body' | 'visibility' | 'attached_type' | 'attached_id' | 'tags' | 'pinned'>
>;

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
	updated_at?: string;
	latest?: boolean;
	prerelease?: boolean;
	draft?: boolean;
	source?: {
		snapshot?: string | null;
		workspace?: string | null;
	};
	artifacts?: ReleaseArtifact[];
	assets?: ReleaseArtifact[];
}

export interface ReleaseArtifact {
	id?: string;
	name: string;
	url?: string | null;
	download_url?: string | null;
	size?: number | string | null;
	digest?: string | null;
	content_type?: string | null;
	uploaded_at?: string | null;
	uploaded_by?: string | null;
	source?: boolean;
	snapshot?: string | null;
}

export interface ProjectScreenshot {
	id: string;
	kind?: 'screenshot' | string;
	title?: string | null;
	name: string;
	url?: string | null;
	download_url: string;
	size?: number | string | null;
	digest?: string | null;
	content_type?: string | null;
	featured?: boolean;
	uploaded_at?: string | null;
	uploaded_by?: string | null;
	created_at?: string;
	updated_at?: string;
}

export interface TagInfo {
	id?: string;
	tag?: string;
	name?: string;
	snapshot?: string | null;
	author?: string;
	created_at?: string;
}

export interface ProjectApiKey {
	id: string;
	prefix: string;
	tenant: string;
	project: string;
	name: string;
	scopes: string[];
	created_by: string;
	created_at: string;
	last_used_at?: string | null;
	expires_at?: string | null;
	revoked_at?: string | null;
	token?: string;
}

export interface ProjectWebhook {
	id: string;
	tenant: string;
	project: string;
	name: string;
	url: string;
	events: string[];
	created_by: string;
	created_at: string;
	updated_at: string;
	last_delivery_at?: string | null;
	last_delivery_status?: number | null;
	active: boolean;
	secret?: string;
}

export interface ProjectWebhookDelivery {
	delivery_id: string;
	hook_id: string;
	event: string;
	status: number;
	attempts: number;
	last_error?: string | null;
	payload_hash: string;
	created_at: string;
	updated_at: string;
}

export interface DeveloperApp {
	id: string;
	owner: string;
	name: string;
	description?: string | null;
	homepage_url?: string | null;
	redirect_uri: string;
	client_id: string;
	created_at: string;
	updated_at: string;
	revoked_at?: string | null;
	client_secret?: string;
}

export interface ProjectIntegration {
	id: string;
	tenant: string;
	project: string;
	app_id: string;
	app_name: string;
	scopes: string[];
	installed_by: string;
	created_at: string;
	revoked_at?: string | null;
}

export interface CiRunner {
	id: string;
	tenant: string;
	project: string;
	name: string;
	prefix: string;
	created_by: string;
	created_at: string;
	concurrency: number;
	labels?: string[];
	last_seen_at?: string | null;
	disabled_at?: string | null;
	token?: string;
}

export interface CiJob {
	id: string;
	tenant: string;
	project: string;
	workspace: string;
	head: string;
	name: string;
	command: string;
	timeout_seconds: number;
	status: 'queued' | 'in_progress' | 'completed' | string;
	conclusion?: string | null;
	summary?: string | null;
	runner_id?: string | null;
	lease_expires_at?: string | null;
	attempt?: number;
	max_attempts?: number;
	artifacts?: string[];
	cache?: CiCacheEntry[];
	env?: { key: string; value: string }[];
	queued_at: string;
	started_at?: string | null;
	completed_at?: string | null;
	updated_at: string;
}

export interface CiCacheEntry {
	key: string;
	path: string;
}

export interface CiLogLine {
	seq: number;
	stream: 'stdout' | 'stderr' | 'system' | string;
	text: string;
	created_at: string;
}

export interface CiArtifact {
	id: string;
	job_id: string;
	name: string;
	size: number;
	digest: string;
	content_type: string;
	created_at: string;
	download_url?: string;
}
