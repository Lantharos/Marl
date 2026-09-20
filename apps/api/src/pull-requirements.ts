import type { BranchRule } from './branch-rules';
import { checkProducerKey, type CheckState } from './check-provenance';

export type CheckCounts = { total: number; passed: number; failed: number; running: number; items?: CheckState[] };
export type RequirementPull = { authorId: string; sourceCommitId: string; state: 'draft' | 'open' | 'merged' | 'closed' };
export type RequirementReview = { authorId: string; state: string; commitId: string };

export function mergeRequirements(pull: RequirementPull, rule: BranchRule, checks: CheckCounts, reviews: RequirementReview[], unresolved: number, authorMerge = false) {
  const latest = new Map<string, string>();
  for (const review of reviews) if (review.commitId === pull.sourceCommitId) latest.set(review.authorId, review.state);
  const approvals = [...latest].filter(([authorId, state]) => authorId !== pull.authorId && state === 'approved').length;
  const changesRequested = [...latest.values()].includes('changes_requested');
  const byProducer = new Map<string, string>();
  for (const check of checks.items ?? []) {
    const key = checkProducerKey(check);
    if (!byProducer.has(key) || check.state !== 'success') byProducer.set(key, check.state);
  }
  const requiredStates = rule.requiredChecks.map((check) => ({ name: check.name, state: byProducer.get(checkProducerKey(check)) }));
  const allChecksPass = checks.total === checks.passed;
  const checksPass = requiredStates.every((check) => check.state === 'success') && (!authorMerge || allChecksPass);
  const reasons: string[] = [];
  for (const check of requiredStates) {
    if (!check.state) reasons.push(`Required check “${check.name}” has not reported.`);
    else if (check.state === 'queued' || check.state === 'running') reasons.push(`Required check “${check.name}” is still running.`);
    else if (check.state !== 'success') reasons.push(`Required check “${check.name}” must pass.`);
  }
  if (changesRequested) reasons.push('Requested changes must be resolved on the current head.');
  if (approvals < rule.requiredApprovals) reasons.push(`${rule.requiredApprovals - approvals} more approval${rule.requiredApprovals - approvals === 1 ? '' : 's'} required.`);
  if (rule.requireConversations && unresolved > 0) reasons.push(`${unresolved} review conversation${unresolved === 1 ? '' : 's'} must be resolved.`);
  if (authorMerge && !allChecksPass) reasons.push('Every check must pass before the author can merge.');
  return { ready: pull.state === 'open' && reasons.length === 0, reasons, approvals, requiredApprovals: rule.requiredApprovals, checksPass, conversationsPass: !rule.requireConversations || unresolved === 0, unresolvedConversations: unresolved };
}
