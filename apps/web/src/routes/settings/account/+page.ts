import { apiWith } from '$lib/api';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ fetch }) => {
  const { user } = await apiWith<{ user: { twoFactorEnabled?: boolean } }>(fetch, '/session');
  return { twoFactorEnabled: Boolean(user.twoFactorEnabled) };
};
