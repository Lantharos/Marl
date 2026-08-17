import { apiWith } from '$lib/api';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ fetch }) => {
  const [methods, { user }] = await Promise.all([
    apiWith<{ ave: boolean; passkey: boolean }>(fetch, '/auth/methods'),
    apiWith<{ user: { twoFactorEnabled?: boolean } }>(fetch, '/session')
  ]);
  return { methods, twoFactorEnabled: Boolean(user.twoFactorEnabled) };
};
