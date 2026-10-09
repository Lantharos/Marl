import { apiWith } from '#lib/api.js';
import { routeLoad } from '#lib/load.js';
import type { PageLoad } from './$types';

export type RepositoryDocument = { path: string; label: string };
type Overview = {
  document: (RepositoryDocument & { html: string | null }) | null;
  documents: RepositoryDocument[];
  availableDocuments: RepositoryDocument[];
  canManage: boolean;
};

export const load = (async ({ fetch, params, url, depends }) => {
  depends('marl:repository-overview');
  const requested = url.searchParams.get('doc');
  const query = requested ? `?${new URLSearchParams({ document: requested })}` : '';
  return routeLoad(apiWith<Overview>(fetch, `/repositories/${params.owner}/${params.repo}/overview${query}`));
}) satisfies PageLoad;
