import type { BranchRule } from './branch-rules';
import { checkProducerKey, type CheckState } from './check-provenance';

export type CheckCounts = { total: number; passed: number; failed: number; running: number; items?: CheckState[] };
export type RequirementPull = { authorId: string; sourceCommitId: string; state: 'draft' | 'open' | 'merged' | 'closed' };
export type RequirementReview = { authorId: string; state: string; commitId: string };

export function mergeRequirements(pull: RequirementPull, rule: BranchRule, checks: CheckCounts, reviews: RequirementReview[], unresolved: number) {
  const latest = new Map<string, string>();
  for (const review of reviews) if (!rule.dismissStaleReviews || review.commitId === pull.sourceCommitId) latest.set(review.authorId, review.state);
  const approvals = [...latest].filter(([authorId, state]) => authorId !== pull.authorId && state === 'approved').length;
  const changesRequested = [...latest.values()].includes('changes_requested');
  const byProducer = new Map((checks.items ?? []).map((check) => [checkProducerKey(check), check.state]));
  const requiredStates = rule.requiredChecks.map((check) => ({ name: check.name, state: byProducer.get(checkProducerKey(check)) }));
  const checksPass = requiredStates.every((check) => check.state === 'success');
  const reasons: string[] = [];
  for (const check of requiredStates) {
    if (!check.state) reasons.push(`Required check “${check.name}” has not reported.`);
    else if (check.state === 'queued' || check.state === 'running') reasons.push(`Required check “${check.name}” is still running.`);
    else if (check.state !== 'success') reasons.push(`Required check “${check.name}” must pass.`);
  }
  if (changesRequested) reasons.push('Requested changes must be resolved on the current head.');
  if (approvals < rule.requiredApprovals) reasons.push(`${rule.requiredApprovals - approvals} more approval${rule.requiredApprovals - approvals === 1 ? '' : 's'} required.`);
  if (rule.requireConversations && unresolved > 0) reasons.push(`${unresolved} review conversation${unresolved === 1 ? '' : 's'} must be resolved.`);
  return { ready: pull.state === 'open' && reasons.length === 0, reasons, approvals, requiredApprovals: rule.requiredApprovals, checksPass, conversationsPass: !rule.requireConversations || unresolved === 0, unresolvedConversations: unresolved };
}
