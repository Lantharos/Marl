import type { PageLoad } from './$types';

export const load: PageLoad = async ({ fetch }) => {
  const response = await fetch('/api/auth/list-sessions', { headers: { accept: 'application/json' } });
  return { sessions: response.ok ? await response.json() : [] };
};
