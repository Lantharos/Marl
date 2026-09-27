import type { Agent } from '@marl/contracts';
import { apiWith } from '$lib/api';
import { routeLoad } from '$lib/load';
import type { PageLoad } from './$types';

export const load = (async ({ fetch, parent }) => {
  const { shellUser } = await parent();
  const handle = shellUser?.handle ?? '';
  const result = await routeLoad(apiWith<{ agents: Agent[] }>(fetch, `/organizations/${handle}/agents`));
  return { agents: result.agents, endpoint: `/organizations/${handle}/agents` };
}) satisfies PageLoad;
