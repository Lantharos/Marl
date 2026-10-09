import type { IssueDetail, PullRequestDiff } from '@marl/contracts';
import { apiWith } from '#lib/api.js';
import { routeLoad } from '#lib/load.js';
import type { PageLoad } from './$types';

type Branch = { name: string; commitId: string };
type PullSource = { owner: string; name: string; defaultBranch: string; branches: Branch[] };

export const load = (async ({ fetch, url, parent }) => {
  const layout = await parent();
  const repositories = layout.shellRepositories;
  const requested = url.searchParams.get('repository');
  const repository =
    requested &&
    repositories.some((item: { owner: string; name: string }) => `${item.owner}/${item.name}` === requested)
      ? requested
      : repositories[0]
        ? `${repositories[0].owner}/${repositories[0].name}`
        : '';
  if (!repository)
    return {
      repositories,
      repository,
      sources: [] as PullSource[],
      sourceRepository: '',
      targetBranches: [] as Branch[],
      base: '',
      compare: '',
      comparison: null as PullRequestDiff | null,
      linkedIssue: null as IssueDetail | null
    };
  const [owner, name] = repository.split('/');
  const issueNumber = Number(url.searchParams.get('issue'));
  const linkedIssue =
    Number.isInteger(issueNumber) && issueNumber > 0
      ? apiWith<{ issue: IssueDetail }>(fetch, `/repositories/${owner}/${name}/issues/${issueNumber}`).then(
          (result) => result.issue,
          () => null
        )
      : null;
  const options = await routeLoad(
    apiWith<{ target: { defaultBranch: string; branches: Branch[] }; sources: PullSource[] }>(
      fetch,
      `/repositories/${owner}/${name}/pull-sources`
    )
  );
  const requestedSource = url.searchParams.get('sourceRepository');
  const source = options.sources.find((item) => `${item.owner}/${item.name}` === requestedSource) ?? options.sources[0];
  const requestedBase = url.searchParams.get('base');
  const base = options.target.branches.some((branch) => branch.name === requestedBase)
    ? requestedBase!
    : options.target.defaultBranch;
  const requestedCompare = url.searchParams.get('compare');
  const compare =
    source?.branches.some((branch) => branch.name === requestedCompare) &&
    (`${source.owner}/${source.name}` !== repository || requestedCompare !== base)
      ? requestedCompare!
      : (source?.branches.find((branch) => `${source.owner}/${source.name}` !== repository || branch.name !== base)
          ?.name ?? '');
  const comparison =
    source && base && compare
      ? apiWith<PullRequestDiff>(
          fetch,
          `/repositories/${owner}/${name}/compare?base=${encodeURIComponent(base)}&head=${encodeURIComponent(compare)}&sourceRepository=${encodeURIComponent(`${source.owner}/${source.name}`)}`
        ).catch(() => null)
      : null;
  return {
    repositories,
    repository,
    sources: options.sources,
    sourceRepository: source ? `${source.owner}/${source.name}` : '',
    targetBranches: options.target.branches,
    base,
    compare,
    comparison: await comparison,
    linkedIssue: await linkedIssue
  };
}) satisfies PageLoad;
