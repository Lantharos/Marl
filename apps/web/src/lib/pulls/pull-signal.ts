import type { PullRequestDetail, PullRequestSummary } from '@marl/contracts';

export type PullSignalTone = 'quiet' | 'working' | 'attention' | 'ready' | 'complete';
export type PullQueueGroup = 'ready' | 'attention' | 'review' | 'draft' | 'complete';

export type PullSignal = {
  group: PullQueueGroup;
  label: string;
  tone: PullSignalTone;
};

export function pullSignal(pull: PullRequestSummary): PullSignal {
  if (pull.state === 'merged') return { group: 'complete', label: 'Merged', tone: 'complete' };
  if (pull.state === 'closed') return { group: 'complete', label: 'Closed', tone: 'quiet' };
  if (pull.state === 'draft') return { group: 'draft', label: 'Draft', tone: 'quiet' };
  if (pull.state === 'mergeable') return { group: 'ready', label: 'Ready to land', tone: 'ready' };
  if (pull.checkSummary.failed > 0) {
    return {
      group: 'attention',
      label: 'Checks failing',
      tone: 'attention'
    };
  }
  if (pull.reviewStatus === 'changes_requested') return { group: 'attention', label: 'Changes requested', tone: 'attention' };
  if (pull.checkSummary.running > 0) return { group: 'review', label: 'Checks running', tone: 'working' };
  if (pull.reviewStatus === 'approved') return { group: 'review', label: 'Awaiting merge', tone: 'working' };
  return { group: 'review', label: 'Awaiting review', tone: 'working' };
}

export function pullDetailSignal(pull: PullRequestDetail): PullSignal {
  if (pull.state === 'merged' || pull.state === 'closed' || pull.state === 'draft') return pullSignal(pull);
  if (pull.checkSummary.failed > 0) {
    return {
      group: 'attention',
      label: 'Checks failing',
      tone: 'attention'
    };
  }
  if (pull.reviewStatus === 'changes_requested') {
    return {
      group: 'attention',
      label: 'Changes requested',
      tone: 'attention'
    };
  }
  if (pull.mergeRequirements.unresolvedConversations > 0) {
    return {
      group: 'attention',
      label: 'Open conversations',
      tone: 'attention'
    };
  }
  if (pull.checkSummary.running > 0) return { group: 'review', label: 'Checks running', tone: 'working' };
  if (pull.mergeRequirements.approvals < pull.mergeRequirements.requiredApprovals) {
    return {
      group: 'review',
      label: 'Awaiting review',
      tone: 'working'
    };
  }
  if (pull.mergeRequirements.ready || pull.state === 'mergeable') return { group: 'ready', label: 'Ready to land', tone: 'ready' };
  return { group: 'review', label: 'Awaiting requirements', tone: 'working' };
}
