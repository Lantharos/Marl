import type { Principal } from './auth';
import { requireFreshSession } from './auth';
import { validSlug } from './domain';
import { json, problem, readJson } from './http';
import type { Env } from './platform';
import { profileBody } from './request-schemas';

const avatarTypes = new Map([
  ['image/png', 'png'],
  ['image/jpeg', 'jpg'],
  ['image/webp', 'webp']
]);

export async function getProfile(env: Env, principal: Principal) {
  if (principal.authType === 'token') return problem(403, 'browser_session_required', 'Profiles can only be managed from a browser session.');
  const profile = await env.DB.prepare('SELECT handle,display_name AS displayName,email,avatar_url AS avatarUrl,bio,website FROM users WHERE id=?').bind(principal.id).first();
  return profile ? json({ profile }) : problem(404, 'profile_not_found', 'Profile not found.');
}

export async function updateProfile(request: Request, env: Env, principal: Principal) {
  if (principal.authType === 'token') return problem(403, 'browser_session_required', 'Profiles can only be managed from a browser session.');
  if (!(await requireFreshSession(request, env, principal))) return problem(403, 'fresh_session_required', 'Confirm your identity before changing your profile.');
  const body = await readJson(request, profileBody);
  if (!body) return problem(422, 'invalid_profile', 'Profile details are invalid.');
  const displayName = body.displayName.trim();
  const username = body.username.trim().toLowerCase();
  const bio = body.bio.trim();
  const website = body.website.trim();
  if (!displayName || displayName.length > 80 || username.length < 2 || username.length > 39 || !validSlug(username) || bio.length > 280 || website.length > 200 || !validWebsite(website)) return problem(422, 'invalid_profile', 'Profile details are invalid.');

  const current = await env.DB.prepare('SELECT handle,auth_user_id AS authUserId FROM users WHERE id=?').bind(principal.id).first<{ handle: string; authUserId: string | null }>();
  if (!current) return problem(404, 'profile_not_found', 'Profile not found.');
  if (username !== current.handle.toLowerCase() && await usernameTaken(env, principal.id, username)) return problem(409, 'username_unavailable', 'That username is unavailable.');

  const statements = [env.DB.prepare('UPDATE users SET handle=?,display_name=?,bio=?,website=? WHERE id=?').bind(username, displayName, bio, website || null, principal.id)];
  if (current.authUserId) statements.push(env.DB.prepare('UPDATE auth_user SET name=?,username=?,display_username=?,updated_at=? WHERE id=?').bind(displayName, username, username, Date.now(), current.authUserId));
  if (username !== current.handle.toLowerCase()) statements.push(env.DB.prepare(`UPDATE organizations SET slug=? WHERE id IN (SELECT organizations.id FROM organizations JOIN organization_members ON organization_members.organization_id=organizations.id WHERE organizations.kind='personal' AND organizations.slug=? COLLATE NOCASE AND organization_members.user_id=? AND organization_members.role='owner')`).bind(username, current.handle, principal.id));
  try {
    await env.DB.batch(statements);
  } catch (error) {
    if (String(error).toLowerCase().includes('unique')) return problem(409, 'username_unavailable', 'That username is unavailable.');
    throw error;
  }
  return json({ profile: { handle: username, displayName, email: principal.email, avatarUrl: principal.avatarUrl, bio, website: website || null } });
}

export async function uploadAvatar(request: Request, env: Env, principal: Principal) {
  if (principal.authType === 'token') return problem(403, 'browser_session_required', 'Profiles can only be managed from a browser session.');
  const contentType = request.headers.get('content-type')?.split(';')[0].toLowerCase() ?? '';
  const extension = avatarTypes.get(contentType);
  const declaredSize = Number(request.headers.get('content-length') ?? 0);
  if (!extension || (declaredSize && declaredSize > 2 * 1024 * 1024)) return problem(422, 'invalid_avatar', 'Choose a PNG, JPEG, or WebP image under 2 MB.');
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (!bytes.length || bytes.length > 2 * 1024 * 1024 || !matchesImageSignature(contentType, bytes)) return problem(422, 'invalid_avatar', 'Choose a valid PNG, JPEG, or WebP image under 2 MB.');

  const version = crypto.randomUUID().replaceAll('-', '');
  const key = `avatars/${principal.id}/${version}.${extension}`;
  const avatarUrl = `/api/v1/avatars/${principal.id}/${version}.${extension}`;
  await env.OBJECTS.put(key, bytes, { httpMetadata: { contentType } });
  const previous = await env.DB.prepare('SELECT avatar_url AS avatarUrl FROM users WHERE id=?').bind(principal.id).first<{ avatarUrl: string | null }>();
  try {
    await env.DB.prepare('UPDATE users SET avatar_url=? WHERE id=?').bind(avatarUrl, principal.id).run();
  } catch (error) {
    await env.OBJECTS.delete(key);
    throw error;
  }
  const previousKey = previous?.avatarUrl && avatarKey(previous.avatarUrl, principal.id);
  if (previousKey) await env.OBJECTS.delete(previousKey);
  return json({ avatarUrl });
}

export async function readAvatar(env: Env, userId: string, file: string) {
  if (!/^usr_[a-z0-9]+$|^[A-Za-z0-9_-]{8,}$/.test(userId) || !/^[a-f0-9]{32}\.(?:png|jpg|webp)$/.test(file)) return problem(404, 'avatar_not_found', 'Avatar not found.');
  const object = await env.OBJECTS.get(`avatars/${userId}/${file}`);
  if (!object) return problem(404, 'avatar_not_found', 'Avatar not found.');
  return new Response(object.body, { headers: { 'content-type': object.httpMetadata?.contentType ?? 'application/octet-stream', 'cache-control': 'public, max-age=31536000, immutable', etag: object.httpEtag, 'x-content-type-options': 'nosniff' } });
}

async function usernameTaken(env: Env, userId: string, username: string) {
  return env.DB.prepare(`SELECT 1 AS found FROM users WHERE handle=? COLLATE NOCASE AND id!=? UNION SELECT 1 FROM organizations WHERE slug=? COLLATE NOCASE AND id NOT IN (SELECT organizations.id FROM organizations JOIN organization_members ON organization_members.organization_id=organizations.id WHERE organizations.kind='personal' AND organization_members.user_id=? AND organization_members.role='owner') LIMIT 1`).bind(username, userId, username, userId).first();
}

function validWebsite(value: string) {
  if (!value) return true;
  try { return ['http:', 'https:'].includes(new URL(value).protocol); } catch { return false; }
}

function avatarKey(value: string, userId: string) {
  const match = value.match(new RegExp(`^/api/v1/avatars/${userId}/([a-f0-9]{32}\\.(?:png|jpg|webp))$`));
  return match ? `avatars/${userId}/${match[1]}` : null;
}

function matchesImageSignature(contentType: string, bytes: Uint8Array) {
  if (contentType === 'image/png') return bytes.length >= 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => bytes[index] === byte);
  if (contentType === 'image/jpeg') return bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  return bytes.length >= 12 && new TextDecoder().decode(bytes.slice(0, 4)) === 'RIFF' && new TextDecoder().decode(bytes.slice(8, 12)) === 'WEBP';
}
