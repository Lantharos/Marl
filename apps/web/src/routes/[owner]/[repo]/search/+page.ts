import type { CodeSearchResult } from '@marl/contracts';
import { apiWith, MarlApiError } from '$lib/api';
import { routeLoad } from '$lib/load';
import type { PageLoad } from './$types';

type Branches = { branches: Array<{ name: string; commitId: string; updatedAt: string }> };

export const load = (async ({ fetch, params, parent, url }) => {
  const repository = (await parent()).repository;
  const query = {
    q: url.searchParams.get('q') ?? '',
    ref: url.searchParams.get('ref') || repository.defaultBranch || 'main',
    regex: url.searchParams.get('regex') === '1',
    caseSensitive: url.searchParams.get('case') === '1'
  };
  const search = new URLSearchParams({ q: query.q, ref: query.ref });
  if (query.regex) search.set('regex', '1');
  if (query.caseSensitive) search.set('case', '1');
  const [branches, outcome] = await Promise.all([
    routeLoad(apiWith<Branches>(fetch, `/repositories/${params.owner}/${params.repo}/branches`)),
    query.q.trim()
      ? apiWith<CodeSearchResult>(fetch, `/repositories/${params.owner}/${params.repo}/search/code?${search}`)
          .then((result) => ({ result, error: null }))
          .catch((cause: unknown) => {
            if (cause instanceof MarlApiError && cause.code === 'invalid_search_pattern')
              return { result: null, error: cause.message };
            return routeLoad<never>(Promise.reject(cause));
          })
      : { result: null, error: null }
  ]);
  return { query, branches: branches.branches, ...outcome };
}) satisfies PageLoad;
