import type { PageLoad } from './$types';

export const load: PageLoad = async ({ url, parent }) => {
  const layout = await parent();
  const repositories = layout.shellRepositories;
  const requested = url.searchParams.get('repository');
  const repositoryFixed = Boolean(requested && /^[^/]+\/[^/]+$/.test(requested));
  const repository = repositoryFixed && requested ? requested : repositories[0] ? `${repositories[0].owner}/${repositories[0].name}` : '';
  return { repositories, repository, repositoryFixed };
};
