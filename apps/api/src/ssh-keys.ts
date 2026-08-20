import type { Principal } from './auth';
import { requireFreshSession } from './auth';
import { identifier } from './domain';
import { json, problem, readJson } from './http';
import type { Env } from './platform';
import { authorizeRepository } from './repository-access';
import { signingKeysBody, sshKeyBody } from './request-schemas';

const keyTypes = new Set(['ssh-ed25519', 'ecdsa-sha2-nistp256', 'ecdsa-sha2-nistp384', 'ecdsa-sha2-nistp521', 'ssh-rsa']);

function base64(bytes: ArrayBuffer) {
  let value = '';
  for (const byte of new Uint8Array(bytes)) value += String.fromCharCode(byte);
  return btoa(value).replace(/=+$/, '');
}

async function normalizeKey(value: string) {
  const [type, encoded] = value.trim().split(/\s+/);
  if (!keyTypes.has(type) || !encoded || encoded.length > 16_000) return null;
  let blob: Uint8Array;
  try {
    blob = Uint8Array.from(atob(encoded), (character) => character.charCodeAt(0));
  } catch {
    return null;
  }
  if (blob.byteLength < 32) return null;
  return { publicKey: `${type} ${encoded}`, fingerprint: `SHA256:${base64(await crypto.subtle.digest('SHA-256', blob.buffer as ArrayBuffer))}` };
}

export async function listSshKeys(env: Env, principal: Principal) {
  if (principal.authType === 'token') return problem(403, 'browser_session_required', 'SSH keys can only be managed from a browser session.');
  const rows = await env.DB.prepare('SELECT id,name,fingerprint,last_used_at AS lastUsedAt,created_at AS createdAt FROM ssh_keys WHERE user_id=? ORDER BY created_at DESC').bind(principal.id).all();
  return json({ sshKeys: rows.results });
}

export async function createSshKey(request: Request, env: Env, principal: Principal) {
  if (!(await requireFreshSession(request, env, principal))) return problem(403, 'fresh_session_required', 'Confirm your identity before adding an SSH key.');
  const body = await readJson(request, sshKeyBody);
  const key = body ? await normalizeKey(body.publicKey) : null;
  if (!body || !key) return problem(422, 'invalid_ssh_key', 'Use a valid OpenSSH public key.');
  const id = identifier('sshkey');
  try {
    await env.DB.prepare('INSERT INTO ssh_keys (id,user_id,name,public_key,fingerprint) VALUES (?,?,?,?,?)').bind(id, principal.id, body.name, key.publicKey, key.fingerprint).run();
  } catch (error) {
    if (String(error).toLowerCase().includes('unique')) return problem(409, 'ssh_key_exists', 'This SSH key is already registered.');
    throw error;
  }
  return json({ sshKey: { id, name: body.name, fingerprint: key.fingerprint, createdAt: new Date().toISOString(), lastUsedAt: null } }, { status: 201 });
}

export async function deleteSshKey(request: Request, env: Env, principal: Principal, id: string) {
  if (!(await requireFreshSession(request, env, principal))) return problem(403, 'fresh_session_required', 'Confirm your identity before removing an SSH key.');
  const key = await env.DB.prepare('SELECT fingerprint FROM ssh_keys WHERE id=? AND user_id=?').bind(id, principal.id).first<{ fingerprint: string }>();
  if (!key) return problem(404, 'ssh_key_not_found', 'SSH key not found.');
  await env.DB.batch([
    env.DB.prepare('DELETE FROM ssh_keys WHERE id=? AND user_id=?').bind(id, principal.id),
    env.DB.prepare("UPDATE commits SET signature_status='unverified',signature_signer_id=NULL,signature_key_fingerprint=NULL WHERE signature_signer_id=? AND signature_key_fingerprint=?").bind(principal.id, key.fingerprint)
  ]);
  return new Response(null, { status: 204 });
}

export async function signingKeys(request: Request, env: Env) {
  const body = await readJson(request, signingKeysBody);
  if (!body) return problem(422, 'invalid_signing_key_lookup', 'Signing key lookup is invalid.');
  const emails = [...new Set(body.emails.map((email) => email.trim().toLowerCase()).filter(Boolean))];
  if (!emails.length) return json({ signingKeys: [] });
  const placeholders = emails.map(() => '?').join(',');
  const rows = await env.DB.prepare(`SELECT users.id AS userId,users.email,ssh_keys.public_key AS publicKey,ssh_keys.fingerprint FROM ssh_keys JOIN users ON users.id=ssh_keys.user_id JOIN auth_user ON auth_user.id=users.auth_user_id AND auth_user.email=users.email COLLATE NOCASE WHERE auth_user.email_verified=1 AND lower(users.email) IN (${placeholders}) ORDER BY users.id,ssh_keys.created_at`).bind(...emails).all();
  return json({ signingKeys: rows.results });
}

export async function authorizeSsh(request: Request, env: Env) {
  if (request.headers.get('x-marl-gateway-token') !== (env.GIT_GATEWAY_TOKEN ?? (env.ENVIRONMENT === 'development' ? 'marl-local' : ''))) return problem(404, 'not_found', 'Route not found.');
  const url = new URL(request.url);
  const fingerprint = url.searchParams.get('fingerprint');
  const owner = url.searchParams.get('owner');
  const repository = url.searchParams.get('repository');
  const service = url.searchParams.get('service');
  if (!fingerprint) return problem(422, 'invalid_ssh_authorization', 'SSH fingerprint is required.');
  const user = await env.DB.prepare(`SELECT users.id,users.handle,users.display_name AS displayName,users.email,users.avatar_url AS avatarUrl,ssh_keys.id AS keyId FROM ssh_keys JOIN users ON users.id=ssh_keys.user_id WHERE ssh_keys.fingerprint=?`).bind(fingerprint).first<{ id: string; handle: string; displayName: string; email: string | null; avatarUrl: string | null; keyId: string }>();
  if (!user) return problem(401, 'ssh_key_unknown', 'SSH key is not registered.');
  if (!owner && !repository && !service) return json({ handle: user.handle });
  if (!owner || !repository || !['git-upload-pack', 'git-receive-pack'].includes(service ?? '')) return problem(422, 'invalid_ssh_authorization', 'SSH authorization parameters are invalid.');
  const principal: Principal = { id: user.id, handle: user.handle, displayName: user.displayName, email: user.email, avatarUrl: user.avatarUrl, authType: 'session' };
  const access = await authorizeRepository(env, principal, owner, repository, service === 'git-receive-pack' ? 'repository.push' : 'repository.read');
  if (!access) return problem(403, 'repository_access_denied', 'Repository access denied.');
  await env.DB.prepare('UPDATE ssh_keys SET last_used_at=CURRENT_TIMESTAMP WHERE id=?').bind(user.keyId).run();
  return json({ repositoryId: access.id, write: service === 'git-receive-pack', handle: user.handle });
}
