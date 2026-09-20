import { apiWith } from '$lib/api';
import type { SigningMode } from '@marl/contracts';
import { routeLoad } from '$lib/load';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ fetch }) => {
  const [{ user }, signing] = await Promise.all([
    routeLoad(apiWith<{ user: { twoFactorEnabled?: boolean } }>(fetch, '/session')),
    routeLoad(apiWith<{ signingMode: SigningMode }>(fetch, '/signing'))
  ]);
  return { twoFactorEnabled: Boolean(user.twoFactorEnabled), signingMode: signing.signingMode };
};
