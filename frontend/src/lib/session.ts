import { browser } from '$app/environment';
import { env } from '$env/dynamic/public';
import { AveSession, createLocalStorageAdapter } from '@ave-id/sdk';
import { completeOAuthCallback, startPkceLogin } from '@ave-id/sdk/client';

export type AveProfile = {
	sub: string;
	name: string;
	preferredUsername?: string;
	email?: string;
	picture?: string;
};

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

let styTokenPromise: Promise<string | null> | null = null;

export function apiBase() {
	if (env.PUBLIC_STY_API_BASE) {
		return env.PUBLIC_STY_API_BASE;
	}
	return 'http://127.0.0.1:8787';
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
	const token = browser ? localStorage.getItem('sty_token') : null;
	if (token) {
		await fetch(`${apiBase()}/v1/session`, {
			method: 'DELETE',
			headers: { authorization: `Bearer ${token}` }
		}).catch(() => {});
	}
	await session.signOut();
	if (browser) {
		localStorage.removeItem('sty_token');
	}
}

export async function getAveProfile() {
	if (!browser) {
		return null;
	}
	const idToken = await session.getValidIdToken();
	if (!idToken) {
		return null;
	}
	return profileFromClaims(decodeJwtPayload(idToken));
}

export function hasStyToken() {
	return browser && Boolean(localStorage.getItem('sty_token'));
}

export function currentStyToken() {
	return browser ? localStorage.getItem('sty_token') : null;
}

export function clearStyToken() {
	styTokenPromise = null;
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
	if (styTokenPromise) {
		return styTokenPromise;
	}
	styTokenPromise = exchangeStyToken().finally(() => {
		styTokenPromise = null;
	});
	return styTokenPromise;
}

async function exchangeStyToken() {
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
	const body = (await response.json()) as { token: string; expires_at?: string };
	localStorage.setItem('sty_token', body.token);
	return body.token;
}

function decodeJwtPayload(token: string) {
	const payload = token.split('.')[1];
	if (!payload) {
		return {};
	}
	const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
	const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), '=');
	return JSON.parse(atob(padded)) as Record<string, unknown>;
}

function stringClaim(claims: Record<string, unknown>, key: string) {
	const value = claims[key];
	return typeof value === 'string' && value.trim() ? value : undefined;
}

function profileFromClaims(claims: Record<string, unknown>): AveProfile | null {
	const sub = stringClaim(claims, 'sub');
	if (!sub) {
		return null;
	}
	const preferredUsername = stringClaim(claims, 'preferred_username');
	const email = stringClaim(claims, 'email');
	const name = stringClaim(claims, 'name') ?? preferredUsername ?? email ?? sub;
	const picture = stringClaim(claims, 'picture');
	return { sub, name, preferredUsername, email, picture };
}
