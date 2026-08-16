import type { BranchRule } from './branch-rules';

export type CheckCounts = { total: number; passed: number; failed: number; running: number };
export type RequirementPull = { authorId: string; sourceCommitId: string; state: 'draft' | 'open' | 'merged' | 'closed' };
export type RequirementReview = { authorId: string; state: string; commitId: string };

export function mergeRequirements(pull: RequirementPull, rule: BranchRule, checks: CheckCounts, reviews: RequirementReview[], unresolved: number) {
  const latest = new Map<string, string>();
  for (const review of reviews) if (!rule.dismissStaleReviews || review.commitId === pull.sourceCommitId) latest.set(review.authorId, review.state);
  const approvals = [...latest].filter(([authorId, state]) => authorId !== pull.authorId && state === 'approved').length;
  const changesRequested = [...latest.values()].includes('changes_requested');
  const checksPass = checks.failed === 0 && checks.running === 0 && (!rule.requireChecks || checks.total > 0);
  const reasons: string[] = [];
  if (!checksPass) reasons.push(rule.requireChecks && checks.total === 0 ? 'At least one required check must report successfully.' : 'Every reported check must pass.');
  if (changesRequested) reasons.push('Requested changes must be resolved on the current head.');
  if (approvals < rule.requiredApprovals) reasons.push(`${rule.requiredApprovals - approvals} more approval${rule.requiredApprovals - approvals === 1 ? '' : 's'} required.`);
  if (rule.requireConversations && unresolved > 0) reasons.push(`${unresolved} review conversation${unresolved === 1 ? '' : 's'} must be resolved.`);
  return { ready: pull.state === 'open' && reasons.length === 0, reasons, approvals, requiredApprovals: rule.requiredApprovals, checksPass, conversationsPass: !rule.requireConversations || unresolved === 0 };
}
