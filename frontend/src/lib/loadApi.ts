import { env } from '$env/dynamic/public';

export function apiUrl(path: string) {
	const base = env.PUBLIC_STY_API_BASE || 'http://127.0.0.1:8787';
	return `${base}${path}`;
}

export async function loadJson<T>(fetcher: typeof fetch, path: string) {
	const response = await fetcher(apiUrl(path));
	if (!response.ok) {
		throw response;
	}
	return (await response.json()) as T;
}
