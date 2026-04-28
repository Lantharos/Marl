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
