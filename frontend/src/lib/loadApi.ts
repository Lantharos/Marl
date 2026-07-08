import { env } from '$env/dynamic/public';
import { applyD1Bookmark, rememberD1Bookmark } from './d1Session';
import { currentStyToken } from './session';

export const DEFAULT_API_BASE = 'https://sty.sh/api';

export function apiUrl(path: string) {
	const configured = env.PUBLIC_STY_API_BASE?.replace(/\/$/, '');
	const base = configured || DEFAULT_API_BASE;
	return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}

export function loadApiFetch(fetcher: typeof fetch, path: string, init: RequestInit = {}) {
	const headers = new Headers(init.headers);
	const token = currentStyToken();
	if (token && !headers.has('authorization')) {
		headers.set('authorization', `Bearer ${token}`);
	}
	applyD1Bookmark(headers);
	return fetcher(apiUrl(path), { ...init, headers }).then((response) => {
		rememberD1Bookmark(response);
		return response;
	});
}

export async function loadJson<T>(fetcher: typeof fetch, path: string) {
	const response = await loadApiFetch(fetcher, path);
	if (!response.ok) {
		throw response;
	}
	return (await response.json()) as T;
}
