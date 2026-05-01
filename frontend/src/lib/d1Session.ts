export const D1_BOOKMARK_HEADER = 'x-d1-bookmark';

const storageKey = 'sty:d1-bookmark';

let d1Bookmark = '';

export async function d1Fetch(input: RequestInfo | URL, init: RequestInit = {}) {
	const headers = new Headers(init.headers);
	applyD1Bookmark(headers);
	const response = await fetch(input, { ...init, headers });
	rememberD1Bookmark(response);
	return response;
}

export function applyD1Bookmark(headers: Headers) {
	const bookmark = currentD1Bookmark();
	if (bookmark) {
		headers.set(D1_BOOKMARK_HEADER, bookmark);
	}
}

export function rememberD1Bookmark(response: Response) {
	const bookmark = response.headers.get(D1_BOOKMARK_HEADER)?.trim();
	if (!bookmark) return;
	d1Bookmark = bookmark;
	if (typeof sessionStorage !== 'undefined') {
		sessionStorage.setItem(storageKey, bookmark);
	}
}

export function clearD1Bookmark() {
	d1Bookmark = '';
	if (typeof sessionStorage !== 'undefined') {
		sessionStorage.removeItem(storageKey);
	}
}

function currentD1Bookmark() {
	if (d1Bookmark) return d1Bookmark;
	if (typeof sessionStorage === 'undefined') return '';
	d1Bookmark = sessionStorage.getItem(storageKey) ?? '';
	return d1Bookmark;
}
