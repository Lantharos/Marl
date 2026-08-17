import { apiWith } from '$lib/api';
import { routeLoad } from '$lib/load';
import type { PageLoad } from './$types';

export type CommitSummary = {
  id: string;
  shortId: string;
  title: string;
  author: string;
  authoredAt: string;
  signatureStatus: string;
};

export const load: PageLoad = async ({ fetch, params }) => ({
  history: await routeLoad(apiWith<{ commits: CommitSummary[] }>(fetch, `/repositories/${params.owner}/${params.repo}/commits?revision=${encodeURIComponent(params.revision)}&limit=100`))
});
