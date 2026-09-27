import type { Agent, OrganizationProfile } from '@marl/contracts';
import { apiWith } from '$lib/api';
import { routeLoad } from '$lib/load';
import type { PageLoad } from './$types';

export const load = (async ({ fetch, params }) => {
  const [profile, agents] = await Promise.all([
    routeLoad(apiWith<{ organization: OrganizationProfile }>(fetch, `/organizations/${params.slug}`)),
    routeLoad(apiWith<{ agents: Agent[] }>(fetch, `/organizations/${params.slug}/agents`))
  ]);
  return { organization: profile.organization, agents: agents.agents };
}) satisfies PageLoad;
