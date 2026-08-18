import { createAuth } from './auth/instance';
import type { Env } from './platform';

export interface Principal {
  id: string;
  handle: string;
  displayName: string;
  email: string | null;
  avatarUrl: string | null;
  twoFactorEnabled?: boolean;
  authType: 'session' | 'token' | 'development';
  tokenScopes?: string[];
  tokenRepositoryIds?: string[] | null;
}

export async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function authenticate(request: Request, env: Env): Promise<Principal | null> {
  if (env.ENVIRONMENT === 'development' && request.headers.has('x-marl-dev-user')) {
    const handle = request.headers.get('x-marl-dev-user')!;
    const user = await applicationUserByHandle(env, handle);
    return user ? { ...user, authType: 'development' } : null;
  }

  const token = authorizationToken(request.headers.get('authorization'));
  if (token?.startsWith('marl_pat_')) return authenticatePersonalToken(env, token);

  const session = await createAuth(env, request).api.getSession({ headers: request.headers });
  if (!session) return null;
  const user = await ensureApplicationUser(env, session.user);
  return { ...user, twoFactorEnabled: Boolean(session.user.twoFactorEnabled), authType: 'session' };
}

export async function requireFreshSession(request: Request, env: Env, principal: Principal) {
  if (principal.authType === 'development') return env.ENVIRONMENT === 'development';
  if (principal.authType !== 'session') return false;
  const result = await createAuth(env, request).api.getSession({ headers: request.headers, query: { disableCookieCache: true } });
  return Boolean(result && Date.now() - new Date(result.session.createdAt).getTime() <= 15 * 60_000);
}

export function principalHasScope(principal: Principal, scope: string) {
  return principal.authType !== 'token' || principal.tokenScopes?.includes(scope) === true;
}

async function authenticatePersonalToken(env: Env, token: string): Promise<Principal | null> {
  const tokenHash = await sha256(token);
  const row = await env.DB.prepare(`SELECT users.id,users.handle,users.display_name AS displayName,users.email,users.avatar_url AS avatarUrl,personal_access_tokens.id AS tokenId,personal_access_tokens.scopes_json AS scopesJson,personal_access_tokens.repository_ids_json AS repositoryIdsJson,personal_access_tokens.last_used_at AS lastUsedAt FROM personal_access_tokens JOIN users ON users.id=personal_access_tokens.user_id WHERE personal_access_tokens.token_hash=? AND personal_access_tokens.revoked_at IS NULL AND personal_access_tokens.expires_at>CURRENT_TIMESTAMP`).bind(tokenHash).first<{ id: string; handle: string; displayName: string; email: string | null; avatarUrl: string | null; tokenId: string; scopesJson: string; repositoryIdsJson: string | null; lastUsedAt: string | null }>();
  if (!row) return null;
  if (!row.lastUsedAt || Date.now() - new Date(row.lastUsedAt).getTime() > 5 * 60_000) await env.DB.prepare('UPDATE personal_access_tokens SET last_used_at=CURRENT_TIMESTAMP WHERE id=?').bind(row.tokenId).run();
  return {
    id: row.id,
    handle: row.handle,
    displayName: row.displayName,
    email: row.email,
    avatarUrl: row.avatarUrl,
    authType: 'token',
    tokenScopes: JSON.parse(row.scopesJson) as string[],
    tokenRepositoryIds: row.repositoryIdsJson ? JSON.parse(row.repositoryIdsJson) as string[] : null
  };
}

function authorizationToken(authorization: string | null) {
  if (authorization?.startsWith('Bearer ')) return authorization.slice(7);
  if (!authorization?.startsWith('Basic ')) return null;
  try {
    const decoded = atob(authorization.slice(6));
    return decoded.slice(decoded.indexOf(':') + 1);
  } catch {
    return null;
  }
}

async function applicationUserByHandle(env: Env, handle: string) {
  return env.DB.prepare('SELECT id,handle,display_name AS displayName,email,avatar_url AS avatarUrl FROM users WHERE handle=? COLLATE NOCASE').bind(handle).first<{ id: string; handle: string; displayName: string; email: string | null; avatarUrl: string | null }>();
}

async function ensureApplicationUser(env: Env, authUser: { id: string; name: string; email: string; image?: string | null; username?: string | null }) {
  const existing = await env.DB.prepare('SELECT id,handle,display_name AS displayName,email,avatar_url AS avatarUrl,auth_user_id AS authUserId FROM users WHERE auth_user_id=? OR email=? COLLATE NOCASE').bind(authUser.id, authUser.email).first<{ id: string; handle: string; displayName: string; email: string | null; avatarUrl: string | null; authUserId: string | null }>();
  if (existing) {
    if (!existing.authUserId) await env.DB.prepare('UPDATE users SET auth_user_id=?,avatar_url=COALESCE(avatar_url,?) WHERE id=? AND auth_user_id IS NULL').bind(authUser.id, authUser.image ?? null, existing.id).run();
    return { id: existing.id, handle: existing.handle, displayName: existing.displayName, email: existing.email, avatarUrl: existing.avatarUrl ?? authUser.image ?? null };
  }
  if (env.ENVIRONMENT === 'development') {
    const legacyHandle = authUser.username ?? authUser.email.split('@')[0].toLowerCase();
    const legacy = await env.DB.prepare('SELECT id,handle,display_name AS displayName,email,avatar_url AS avatarUrl FROM users WHERE handle=? COLLATE NOCASE AND email IS NULL').bind(legacyHandle).first<{ id: string; handle: string; displayName: string; email: string | null; avatarUrl: string | null }>();
    if (legacy) {
      await env.DB.prepare('UPDATE users SET auth_user_id=?,email=?,avatar_url=COALESCE(?,avatar_url) WHERE id=?').bind(authUser.id, authUser.email, authUser.image ?? null, legacy.id).run();
      return { ...legacy, email: authUser.email, avatarUrl: authUser.image ?? legacy.avatarUrl };
    }
  }
  const handle = authUser.username ?? await availableHandle(env, authUser.email.split('@')[0] || authUser.name);
  const organizationId = `org_${crypto.randomUUID().replaceAll('-', '')}`;
  await env.DB.batch([
    env.DB.prepare('INSERT OR IGNORE INTO users (id,handle,display_name,email,avatar_url,auth_user_id) VALUES (?,?,?,?,?,?)').bind(authUser.id, handle, authUser.name, authUser.email, authUser.image ?? null, authUser.id),
    env.DB.prepare(`INSERT OR IGNORE INTO organizations (id,slug,name,kind,base_repository_role) VALUES (?,?,?,'personal',NULL)`).bind(organizationId, handle, authUser.name),
    env.DB.prepare(`INSERT OR IGNORE INTO organization_members (organization_id,user_id,role) VALUES (?,?,'owner')`).bind(organizationId, authUser.id)
  ]);
  return { id: authUser.id, handle, displayName: authUser.name, email: authUser.email, avatarUrl: authUser.image ?? null };
}

async function availableHandle(env: Env, source: string) {
  const base = source.toLowerCase().normalize('NFKD').replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 32) || 'user';
  for (let suffix = 0; suffix < 100; suffix++) {
    const value = suffix ? `${base.slice(0, 27)}-${suffix}` : base;
    const taken = await env.DB.prepare('SELECT 1 AS found FROM users WHERE handle=? COLLATE NOCASE UNION SELECT 1 FROM organizations WHERE slug=? COLLATE NOCASE LIMIT 1').bind(value, value).first();
    if (!taken) return value;
  }
  return `${base.slice(0, 20)}-${crypto.randomUUID().slice(0, 8)}`;
}
