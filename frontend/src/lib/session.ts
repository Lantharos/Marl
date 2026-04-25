import { browser } from '$app/environment';
import { env } from '$env/dynamic/public';
import { AveSession, createLocalStorageAdapter } from '@ave-id/sdk';
import { completeOAuthCallback, startPkceLogin } from '@ave-id/sdk/client';
import { aveSessionToStore } from '@ave-id/sdk/svelte';

const defaultAveClientId = 'app_813ac5533bb87d939f328d76b5a1dca8';
const redirectUri = browser ? `${window.location.origin}/auth/callback` : '';
const storage = browser
	? createLocalStorageAdapter('sty_ave_session')
	: {
			async load() {
				return null;
			},
			async save() {}
		};

export const session = new AveSession({
	oauth: {
		clientId: aveClientId(),
		redirectUri
	},
	storage,
	devtools: import.meta.env.DEV
});

export const sessionStore = aveSessionToStore(session);

export function apiBase() {
	return env.PUBLIC_STY_API_BASE || 'http://127.0.0.1:7379';
}

export function aveClientId() {
	return env.PUBLIC_AVE_CLIENT_ID || defaultAveClientId;
}

export async function hydrateSession() {
	await session.hydrate();
}

export async function startLogin() {
	await startPkceLogin({
		clientId: aveClientId(),
		redirectUri,
		scope: 'openid profile email offline_access'
	});
}

export async function finishLogin() {
	return completeOAuthCallback(session, {
		clientId: aveClientId(),
		redirectUri
	});
}

export async function signOut() {
	await session.signOut();
	if (browser) {
		localStorage.removeItem('sty_token');
	}
}

export async function getStyToken() {
	if (!browser) {
		return null;
	}
	const existing = localStorage.getItem('sty_token');
	if (existing) {
		return existing;
	}
	const idToken = await session.getValidIdToken();
	if (!idToken) {
		return null;
	}
	const response = await fetch(`${apiBase()}/v1/session/exchange`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ id_token: idToken })
	});
	if (!response.ok) {
		throw new Error(await response.text());
	}
	const body = (await response.json()) as { token: string };
	localStorage.setItem('sty_token', body.token);
	return body.token;
}
