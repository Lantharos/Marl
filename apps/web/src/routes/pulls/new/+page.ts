import type { PullRequestDiff } from '@sty/contracts';
import { apiWith } from '$lib/api';
import { routeLoad } from '$lib/load';
import type { PageLoad } from './$types';

type Branch = { name: string; commitId: string };

export const load: PageLoad = async ({ fetch, url, parent }) => {
  const layout = await parent();
  const result = { repositories: layout.shellRepositories };
  const requested = url.searchParams.get('repository');
  const repository = requested && result.repositories.some((item: { owner: string; name: string }) => `${item.owner}/${item.name}` === requested)
    ? requested
    : result.repositories[0] ? `${result.repositories[0].owner}/${result.repositories[0].name}` : '';
  if (!repository) return { repositories: result.repositories, repository, branches: [] as Branch[], base: '', compare: '', comparison: null as PullRequestDiff | null };
  const [owner, ...name] = repository.split('/');
  const branches = await routeLoad(apiWith<{ defaultBranch: string; branches: Branch[] }>(fetch, `/repositories/${owner}/${name.join('/')}/branches`));
  const base = branches.defaultBranch;
  const compare = branches.branches.find((branch) => branch.name !== base)?.name ?? '';
  let comparison: PullRequestDiff | null = null;
  if (base && compare) {
    try {
      comparison = await apiWith<PullRequestDiff>(fetch, `/repositories/${owner}/${name.join('/')}/compare?base=${encodeURIComponent(base)}&head=${encodeURIComponent(compare)}`);
    } catch {}
  }
  return { repositories: result.repositories, repository, branches: branches.branches, base, compare, comparison };
};
