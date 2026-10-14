import type { ReleaseSummary } from '@marl/contracts';
import { apiWith } from '#lib/api.js';
import { routeLoad } from '#lib/load.js';
import type { BranchSummary } from '#lib/repositories/browser/types.js';
import type { CodeRepository } from '#lib/workspace/code/code-repository.js';
import type { LayoutLoad } from './$types';

export const load = (async ({ fetch, params }) => {
  const endpoint = `/repositories/${params.owner}/${params.repo}`;
  const latestRelease = apiWith<{ releases: ReleaseSummary[] }>(fetch, `${endpoint}/releases?limit=10`)
    .then(({ releases }) => releases.find((release) => release.latest) ?? null)
    .catch(() => null);
  const [{ repository }, { branches }] = await routeLoad(
    Promise.all([
      apiWith<{ repository: CodeRepository }>(fetch, endpoint),
      apiWith<{ branches: BranchSummary[] }>(fetch, `${endpoint}/branches`)
    ])
  );
  return { repository, branches, latestRelease };
}) satisfies LayoutLoad;
