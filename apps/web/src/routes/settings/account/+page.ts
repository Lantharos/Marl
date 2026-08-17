import { apiWith } from '$lib/api';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ fetch }) => {
  const [{ tokens }, methods, { user }] = await Promise.all([
    apiWith<{ tokens: Array<{ id: string; name: string; tokenPrefix: string; scopes: string[]; expiresAt: string; lastUsedAt: string | null; createdAt: string }> }>(fetch, '/tokens'),
    apiWith<{ ave: boolean; passkey: boolean }>(fetch, '/auth/methods'),
    apiWith<{ user: { twoFactorEnabled?: boolean } }>(fetch, '/session')
  ]);
  return { tokens, methods, twoFactorEnabled: Boolean(user.twoFactorEnabled) };
};
