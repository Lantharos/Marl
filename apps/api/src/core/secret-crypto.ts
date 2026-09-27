import type { Env } from './platform';

function bytes(value: string) {
  return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
}

function encoded(value: ArrayBuffer | Uint8Array) {
  const data = value instanceof Uint8Array ? value : new Uint8Array(value);
  let binary = '';
  for (const byte of data) binary += String.fromCharCode(byte);
  return btoa(binary);
}

async function key(env: Env) {
  if (!env.SECRET_ENCRYPTION_KEY) throw new Error('SECRET_ENCRYPTION_KEY is not configured');
  const raw = bytes(env.SECRET_ENCRYPTION_KEY);
  if (raw.byteLength !== 32) throw new Error('SECRET_ENCRYPTION_KEY must decode to 32 bytes');
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

function context(organizationId: string, repositoryId: string | null, name: string) {
  return new TextEncoder().encode(`${organizationId}:${repositoryId ?? 'organization'}:${name}`);
}

export async function encryptSecret(env: Env, organizationId: string, repositoryId: string | null, name: string, value: string) {
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce, additionalData: context(organizationId, repositoryId, name) }, await key(env), new TextEncoder().encode(value));
  return { ciphertext: encoded(ciphertext), nonce: encoded(nonce) };
}

export async function decryptSecret(env: Env, secret: { organizationId: string; repositoryId: string | null; name: string; ciphertext: string; nonce: string }) {
  const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes(secret.nonce), additionalData: context(secret.organizationId, secret.repositoryId, secret.name) }, await key(env), bytes(secret.ciphertext));
  return new TextDecoder().decode(plaintext);
}
