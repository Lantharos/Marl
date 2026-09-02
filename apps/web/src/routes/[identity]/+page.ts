import type { PublicIdentityProfile } from '@marl/contracts';
import { redirect } from '@sveltejs/kit';
import { apiWith } from '$lib/api';
import { routeLoad } from '$lib/load';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ fetch, params, url }) => {
  const result = await routeLoad(apiWith<PublicIdentityProfile>(fetch, `/profiles/${encodeURIComponent(params.identity.toLowerCase())}`));
  const canonicalIdentity = 'profile' in result ? result.profile.handle : result.organization.slug;
  if (params.identity !== canonicalIdentity) redirect(308, `/${encodeURIComponent(canonicalIdentity)}${url.search}`);
  return result;
};
