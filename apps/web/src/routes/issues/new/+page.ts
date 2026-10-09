import type { PageLoad } from './$types';

export const load = (async ({ url, parent }) => {
  const { shellRepositories: repositories } = await parent();
  const requested = url.searchParams.get('repository');
  const first = repositories[0];
  const repository =
    requested && /^[^/]+\/[^/]+$/.test(requested) ? requested : first ? `${first.owner}/${first.name}` : '';
  return { repositories, repository };
}) satisfies PageLoad;
