import type { UserProfile } from './api';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const UUID_IN_TEXT_PATTERN = /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi;

export function isOpaqueUserId(value: string | null | undefined) {
	return Boolean(value && UUID_PATTERN.test(value.trim()));
}

export function profileName(profile: UserProfile | null | undefined) {
	return profile?.handle?.trim() || profile?.display_name?.trim() || '';
}

export function profileDisplayName(profile: UserProfile | null | undefined) {
	return profile?.display_name?.trim() || profile?.handle?.trim() || '';
}

export function userName(value: string | null | undefined, profile?: UserProfile | null) {
	const fromProfile = profileName(profile);
	if (fromProfile) return fromProfile;
	const text = value?.trim() ?? '';
	return text && !isOpaqueUserId(text) ? text : 'Unknown user';
}

export function userDisplayName(value: string | null | undefined, profile?: UserProfile | null) {
	const fromProfile = profileDisplayName(profile);
	if (fromProfile) return fromProfile;
	const text = value?.trim() ?? '';
	return text && !isOpaqueUserId(text) ? text : 'Unknown user';
}

export function userProfileHref(value: string | null | undefined, profile?: UserProfile | null) {
	const tenant = profile?.account_tenant?.trim();
	if (tenant) return `/${encodeURIComponent(tenant)}`;
	const handle = profile?.handle?.trim();
	if (handle) return `/u/${encodeURIComponent(handle)}`;
	const text = value?.trim() ?? '';
	return text && !isOpaqueUserId(text) ? `/${encodeURIComponent(text)}` : null;
}

export function userInitials(value: string | null | undefined, profile?: UserProfile | null) {
	const name = userName(value, profile);
	if (name === 'Unknown user') return '?';
	const parts = name.trim().split(/\s+/).filter(Boolean);
	if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
	return (parts[0] ?? name).slice(0, 2).toUpperCase();
}

export function withoutOpaqueUserIds(value: string | null | undefined) {
	return (value ?? '').replace(UUID_IN_TEXT_PATTERN, '').replace(/\s{2,}/g, ' ').trim();
}
