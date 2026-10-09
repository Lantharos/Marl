import type { NotificationPreferences } from '@marl/contracts';
import { apiWith } from '#lib/api.js';
import { routeLoad } from '#lib/load.js';
import type { PageLoad } from './$types';

export const load = (async ({ fetch }) => ({
  preferences: await routeLoad(apiWith<NotificationPreferences>(fetch, '/notifications/preferences'))
})) satisfies PageLoad;
