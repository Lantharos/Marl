import type { MergeMethod } from '@sty/contracts';
import { apiWith } from '$lib/api';
import type { PageLoad } from './$types';

type BranchRule = { pattern: string; requiredApprovals: number; requireChecks: boolean; requireConversations: boolean; dismissStaleReviews: boolean; allowedMergeMethods: MergeMethod[] };

export const load: PageLoad = async ({ fetch, params }) => {
  const base = `/repositories/${params.owner}/${params.repo}`;
  const [branches, rules] = await Promise.all([
    apiWith<{ defaultBranch: string; branches: Array<{ name: string }> }>(fetch, `${base}/branches`),
    apiWith<{ branchRules: BranchRule[] }>(fetch, `${base}/branch-rules`)
  ]);
  return { ...branches, rules: rules.branchRules };
};
