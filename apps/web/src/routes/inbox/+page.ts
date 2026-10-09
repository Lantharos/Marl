import type { InboxPage } from '@marl/contracts';
import { apiWith } from '#lib/api.js';
import type { InboxStatus } from '#lib/inbox/inbox-state.svelte.js';
import { routeLoad } from '#lib/load.js';
import type { PageLoad } from './$types';

const statuses: InboxStatus[] = ['inbox', 'unread', 'done'];

export const load = (async ({ fetch, url }) => {
  const requested = url.searchParams.get('status');
  const status = statuses.find((candidate) => candidate === requested) ?? 'inbox';
  const result = await routeLoad(apiWith<InboxPage>(fetch, `/inbox?status=${status}&limit=40`));
  return { ...result, status };
}) satisfies PageLoad;
