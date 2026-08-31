import { apiWith } from '$lib/api';
import { routeLoad } from '$lib/load';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ fetch }) => {
  const { user } = await routeLoad(apiWith<{ user: { twoFactorEnabled?: boolean } }>(fetch, '/session'));
  return { twoFactorEnabled: Boolean(user.twoFactorEnabled) };
};
