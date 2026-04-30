export interface UserProfile {
	user: string;
	display_name: string;
	handle?: string | null;
	avatar_url?: string | null;
	email?: string | null;
	updated_at?: string | null;
}

export type CollaboratorRole = 'owner' | 'maintainer' | 'contributor' | 'viewer';

export interface AccessResponse {
	role?: CollaboratorRole | string | null;
	source?: string | null;
	archived: boolean;
	archived_at?: string | null;
	archived_by?: string | null;
	archived_by_profile?: UserProfile | null;
	can_read: boolean;
	can_write: boolean;
	can_maintain: boolean;
	can_admin: boolean;
}

export interface Collaborator {
	user: string;
	role: CollaboratorRole | string;
	source: 'owner' | 'tenant' | 'project' | string;
	profile?: UserProfile | null;
	added_by?: string | null;
	added_at?: string | null;
	updated_at?: string | null;
	direct: boolean;
	removable: boolean;
}
