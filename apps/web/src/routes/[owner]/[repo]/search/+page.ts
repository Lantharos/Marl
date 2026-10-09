import type { CodeSearchResult } from '@marl/contracts';
import { apiWith, MarlApiError } from '#lib/api.js';
import { routeLoad } from '#lib/load.js';
import type { BranchSummary } from '#lib/repositories/browser/types.js';
import type { PageLoad } from './$types';

export const load = (async ({ fetch, params, url }) => {
  const query = {
    q: url.searchParams.get('q') ?? '',
    ref: url.searchParams.get('ref') ?? '',
    regex: url.searchParams.get('regex') === '1',
    caseSensitive: url.searchParams.get('case') === '1'
  };
  const search = new URLSearchParams({ q: query.q });
  if (query.ref) search.set('ref', query.ref);
  if (query.regex) search.set('regex', '1');
  if (query.caseSensitive) search.set('case', '1');
  const [branches, outcome] = await Promise.all([
    routeLoad(apiWith<{ branches: BranchSummary[] }>(fetch, `/repositories/${params.owner}/${params.repo}/branches`)),
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
