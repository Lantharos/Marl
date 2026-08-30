import type { PageLoad } from './$types';

export const load: PageLoad = async ({ url, parent }) => {
  const layout = await parent();
  const repositories = layout.shellRepositories;
  const requested = url.searchParams.get('repository');
  const repository = requested && repositories.some((item: { owner: string; name: string }) => `${item.owner}/${item.name}` === requested) ? requested : repositories[0] ? `${repositories[0].owner}/${repositories[0].name}` : '';
  return { repositories, repository };
};
