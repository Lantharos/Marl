import { apiWith } from '#lib/api.js';
import type { SigningMode } from '@marl/contracts';
import { routeLoad } from '#lib/load.js';
import type { PageLoad } from './$types';

export const load = (async ({ fetch }) => {
  const [{ user }, signing] = await Promise.all([
    routeLoad(apiWith<{ user: { twoFactorEnabled?: boolean } }>(fetch, '/session')),
    routeLoad(apiWith<{ signingMode: SigningMode }>(fetch, '/signing'))
  ]);
  return { twoFactorEnabled: Boolean(user.twoFactorEnabled), signingMode: signing.signingMode };
}) satisfies PageLoad;
