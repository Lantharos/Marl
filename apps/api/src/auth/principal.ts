import { sha256 } from '../core/encoding';
import { createAuth } from './instance';
import type { Env } from '../core/platform';

export interface Principal {
  id: string;
  handle: string;
  displayName: string;
  email: string | null;
  avatarUrl: string | null;
  twoFactorEnabled?: boolean;
  kind: 'person' | 'agent';
  authType: 'session' | 'token';
  tokenScopes?: string[];
  tokenRepositoryIds?: string[] | null;
}

export async function authenticate(request: Request, env: Env): Promise<Principal | null> {
  const token = authorizationToken(request.headers.get('authorization'));
  if (token?.startsWith('marl_pat_')) return authenticatePersonalToken(env, token);

  const session = await createAuth(env, request).api.getSession({ headers: request.headers });
  if (!session) return null;
  const { suspendedAt, ...principal } = await applicationUser(env, session.user);
  if (suspendedAt) return null;
  return {
    ...principal,
    kind: 'person',
    twoFactorEnabled: Boolean(session.user.twoFactorEnabled),
    authType: 'session'
  };
}

export async function requireFreshSession(request: Request, env: Env, principal: Principal) {
  if (principal.authType !== 'session') return false;
  const result = await createAuth(env, request).api.getSession({
    headers: request.headers,
    query: { disableCookieCache: true }
  });
  return Boolean(result && Date.now() - new Date(result.session.createdAt).getTime() <= 15 * 60_000);
}

export function principalHasScope(principal: Principal, scope: string) {
  return principal.authType !== 'token' || principal.tokenScopes?.includes(scope) === true;
}

async function authenticatePersonalToken(env: Env, token: string): Promise<Principal | null> {
  const tokenHash = await sha256(token);
  const row = await env.DB.prepare(
    `SELECT users.id,users.handle,users.display_name AS displayName,users.email,users.avatar_url AS avatarUrl,users.kind,personal_access_tokens.id AS tokenId,personal_access_tokens.scopes_json AS scopesJson,personal_access_tokens.repository_ids_json AS repositoryIdsJson,personal_access_tokens.last_used_at AS lastUsedAt FROM personal_access_tokens JOIN users ON users.id=personal_access_tokens.user_id WHERE personal_access_tokens.token_hash=? AND personal_access_tokens.revoked_at IS NULL AND personal_access_tokens.expires_at>CURRENT_TIMESTAMP AND users.suspended_at IS NULL`
  )
    .bind(tokenHash)
    .first<{
      id: string;
      handle: string;
      displayName: string;
      email: string | null;
      avatarUrl: string | null;
      kind: 'person' | 'agent';
      tokenId: string;
      scopesJson: string;
      repositoryIdsJson: string | null;
      lastUsedAt: string | null;
    }>();
  if (!row) return null;
  if (!row.lastUsedAt || Date.now() - new Date(row.lastUsedAt).getTime() > 5 * 60_000)
    await env.DB.prepare('UPDATE personal_access_tokens SET last_used_at=CURRENT_TIMESTAMP WHERE id=?')
      .bind(row.tokenId)
      .run();
  return {
    id: row.id,
    handle: row.handle,
    displayName: row.displayName,
    email: row.email,
    avatarUrl: row.avatarUrl,
    kind: row.kind,
    authType: 'token',
    tokenScopes: JSON.parse(row.scopesJson) as string[],
    tokenRepositoryIds: row.repositoryIdsJson ? (JSON.parse(row.repositoryIdsJson) as string[]) : null
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

type AuthUser = {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  image?: string | null;
  username?: string | null;
};

type ApplicationUser = Omit<Principal, 'kind' | 'authType' | 'twoFactorEnabled'> & { suspendedAt: string | null };

async function applicationUser(env: Env, authUser: AuthUser) {
  const existing = await env.DB.prepare(
    'SELECT id,handle,display_name AS displayName,email,avatar_url AS avatarUrl,suspended_at AS suspendedAt FROM users WHERE id=?'
  )
    .bind(authUser.id)
    .first<ApplicationUser>();
  return existing ?? provisionUser(env, authUser);
}

async function provisionUser(env: Env, authUser: AuthUser): Promise<ApplicationUser> {
  const handle = authUser.username!;
  const email = authUser.email.trim().toLowerCase();
  const verified = authUser.emailVerified || env.ENVIRONMENT === 'development';
  const organizationId = `org_${crypto.randomUUID().replaceAll('-', '')}`;
  await env.DB.batch([
    env.DB.prepare('INSERT OR IGNORE INTO users (id,handle,display_name,email,avatar_url) VALUES (?,?,?,?,?)').bind(
      authUser.id,
      handle,
      authUser.name,
      email,
      authUser.image ?? null
    ),
    env.DB.prepare(
      `INSERT OR IGNORE INTO organizations (id,slug,name,kind,base_repository_role) VALUES (?,?,?,'personal',NULL)`
    ).bind(organizationId, handle, authUser.name),
    env.DB.prepare(
      `INSERT OR IGNORE INTO organization_members (organization_id,user_id,role) SELECT id,?,'owner' FROM organizations WHERE slug=? COLLATE NOCASE AND kind='personal'`
    ).bind(authUser.id, handle),
    env.DB.prepare('INSERT OR IGNORE INTO notification_settings (user_id) VALUES (?)').bind(authUser.id),
    env.DB.prepare(
      `INSERT OR IGNORE INTO user_emails (id,user_id,email,primary_email,verified_at) VALUES (?,?,?,1,CASE WHEN ? THEN CURRENT_TIMESTAMP END)`
    ).bind(`email_${crypto.randomUUID().replaceAll('-', '')}`, authUser.id, email, verified ? 1 : 0)
  ]);
  return {
    id: authUser.id,
    handle,
    displayName: authUser.name,
    email,
    avatarUrl: authUser.image ?? null,
    suspendedAt: null
  };
}
