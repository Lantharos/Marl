import type { Env } from './platform';

export interface Principal { id: string; handle: string; }

export async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function authenticate(request: Request, env: Env): Promise<Principal | null> {
  if (env.ENVIRONMENT === 'development') {
    const handle = request.headers.get('x-sty-dev-user') ?? 'kristof';
    return env.DB.prepare('SELECT id, handle FROM users WHERE handle = ? COLLATE NOCASE').bind(handle).first<Principal>();
  }
  const authorization = request.headers.get('authorization');
  let token: string | null = null;
  if (authorization?.startsWith('Bearer ')) token = authorization.slice(7);
  if (authorization?.startsWith('Basic ')) {
    try {
      const decoded = atob(authorization.slice(6));
      token = decoded.slice(decoded.indexOf(':') + 1);
    } catch {
      return null;
    }
  }
  if (!token) return null;
  const tokenHash = await sha256(token);
  return env.DB.prepare(`SELECT users.id, users.handle FROM sessions JOIN users ON users.id = sessions.user_id WHERE sessions.token_hash = ? AND sessions.expires_at > CURRENT_TIMESTAMP`).bind(tokenHash).first<Principal>();
}
