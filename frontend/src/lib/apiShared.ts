import { apiBase, currentStyToken, getStyToken } from './session';

export interface ApiOptions {
	signal?: AbortSignal;
}

export interface PageOptions extends ApiOptions {
	page?: number;
	perPage?: number;
	all?: boolean;
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
	scope?: 'public' | 'all';
}

export function isAbortError(error: unknown) {
	return error instanceof Error && error.name === 'AbortError';
}

export async function authedFetch(path: string, init: RequestInit = {}) {
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

export async function publicFetch(path: string, init: RequestInit = {}) {
	const token = currentStyToken();
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

export function pageQuery(options: PageOptions = {}) {
	const params = new URLSearchParams();
	if (options.page) params.set('page', String(options.page));
	if (options.perPage) params.set('per_page', String(options.perPage));
	if (options.all) params.set('all', 'true');
	if (options.state && options.state !== 'all') params.set('state', options.state);
	if (options.label) params.set('label', options.label);
	if (options.assignee) params.set('assignee', options.assignee);
	const value = params.toString();
	return value ? `?${value}` : '';
}

export function notifyProjectStatsChanged(tenant: string, project: string) {
	if (typeof window === 'undefined') return;
	window.dispatchEvent(new CustomEvent('sty:project-stats-changed', { detail: { tenant, project } }));
}
