import type { Env } from './platform';

const encoder = new TextEncoder();

function base64Url(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '');
}

function fromBase64Url(value: string) {
  const padded = value
    .replaceAll('-', '+')
    .replaceAll('_', '/')
    .padEnd(Math.ceil(value.length / 4) * 4, '=');
  return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
}

async function hmacKey(secret: string) {
  return crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
    'verify'
  ]);
}

export async function hmacSha256Hex(secret: string, message: string) {
  const signature = await crypto.subtle.sign('HMAC', await hmacKey(secret), encoder.encode(message));
  return [...new Uint8Array(signature)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function signingSecret(env: Env) {
  if (!env.AUTH_SECRET) throw new Error('AUTH_SECRET is required.');
  return env.AUTH_SECRET;
}

export async function signToken(env: Env, purpose: string, subject: string, lifetimeSeconds: number) {
  const payload = base64Url(
    encoder.encode(JSON.stringify({ p: purpose, s: subject, e: Math.floor(Date.now() / 1000) + lifetimeSeconds }))
  );
  const signature = await crypto.subtle.sign('HMAC', await hmacKey(signingSecret(env)), encoder.encode(payload));
  return `${payload}.${base64Url(new Uint8Array(signature))}`;
}

export async function verifyToken(env: Env, purpose: string, token: string | null) {
  const [payload, signature] = token?.split('.') ?? [];
  if (!payload || !signature) return null;
  try {
    const valid = await crypto.subtle.verify(
      'HMAC',
      await hmacKey(signingSecret(env)),
      fromBase64Url(signature),
      encoder.encode(payload)
    );
    if (!valid) return null;
    const claims = JSON.parse(new TextDecoder().decode(fromBase64Url(payload))) as { p: string; s: string; e: number };
    return claims.p === purpose && claims.e > Date.now() / 1000 ? claims.s : null;
  } catch {
    return null;
  }
}
