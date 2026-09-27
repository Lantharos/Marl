import type { OrganizationProfile, Webhook } from '@marl/contracts';
import { apiWith } from '$lib/api';
import { routeLoad } from '$lib/load';
import type { PageLoad } from './$types';

export const load = (async ({ fetch, params }) => {
  const [profile, hooks] = await Promise.all([
    routeLoad(apiWith<{ organization: OrganizationProfile }>(fetch, `/organizations/${params.slug}`)),
    routeLoad(apiWith<{ webhooks: Webhook[] }>(fetch, `/organizations/${params.slug}/webhooks`))
  ]);
  return { organization: profile.organization, webhooks: hooks.webhooks };
}) satisfies PageLoad;
