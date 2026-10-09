import type { Principal } from '../../auth/principal';
import type { Env } from '../../core/platform';

export async function queueActor(env: Env, userId: string): Promise<Principal | null> {
  const user = await env.DB.prepare(
    'SELECT id,handle,display_name AS displayName,email,avatar_url AS avatarUrl,kind FROM users WHERE id=? AND deleted_at IS NULL AND suspended_at IS NULL'
  )
    .bind(userId)
    .first<Omit<Principal, 'authType'>>();
  return user ? { ...user, authType: 'session' } : null;
}
