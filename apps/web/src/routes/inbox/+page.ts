import type { InboxPage } from '@marl/contracts';
import { apiWith } from '$lib/api';
import { routeLoad } from '$lib/load';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ fetch, url }) => {
  const status = ['inbox', 'unread', 'done'].includes(url.searchParams.get('status') ?? '') ? url.searchParams.get('status')! : 'inbox';
  const cursor = url.searchParams.get('cursor');
  const result = await routeLoad(apiWith<InboxPage>(fetch, `/inbox?status=${status}&limit=40${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`));
  return { ...result, status };
};
