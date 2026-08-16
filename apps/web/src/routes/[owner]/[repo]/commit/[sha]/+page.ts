import { apiWith } from '$lib/api';
import type { PageLoad } from './$types';

export type CommitDetail = {
  id: string;
  parents: string[];
  title: string;
  body: string;
  author: string;
  authorEmail: string;
  authoredAt: string;
  signatureStatus: string;
  files: Array<{ path: string; oldPath?: string; status: 'added' | 'modified' | 'deleted' | 'renamed'; additions: number; deletions: number; patch: string }>;
};

export const load: PageLoad = async ({ fetch, params }) => ({
  commit: await apiWith<CommitDetail>(fetch, `/repositories/${params.owner}/${params.repo}/commits/${params.sha}`)
});
