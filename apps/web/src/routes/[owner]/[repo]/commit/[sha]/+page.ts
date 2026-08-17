import { apiWith } from '$lib/api';
import { routeLoad } from '$lib/load';
import type { PageLoad } from './$types';

export type CommitDetail = {
  id: string;
  parents: string[];
  title: string;
  body: string;
  author: string;
  authorEmail: string;
  authorAvatarUrl?: string | null;
  authoredAt: string;
  signatureStatus: string;
  files: Array<{ path: string; oldPath?: string; status: 'added' | 'modified' | 'deleted' | 'renamed'; additions: number; deletions: number; patch: string; patchOmitted?: 'deleted' | 'large' | 'lazy' }>;
};

export const load: PageLoad = async ({ fetch, params }) => ({
  commit: await routeLoad(apiWith<CommitDetail>(fetch, `/repositories/${params.owner}/${params.repo}/commits/${params.sha}`))
});
