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

export function pullDetailSignal(pull: PullRequestDetail, conflicted = false): PullSignal {
  if (pull.state === 'merged' || pull.state === 'closed' || pull.state === 'draft') return pullSignal(pull);
  if (conflicted) return { group: 'attention', label: 'Conflicted', tone: 'attention' };
  if (pull.reviewStatus === 'changes_requested') return { group: 'attention', label: 'Changes requested', tone: 'attention' };
  if (pull.checkSummary.failed > 0) return { group: 'attention', label: 'Checks failing', tone: 'attention' };
  if (pull.checksApproval.waiting > 0) return { group: 'review', label: 'Checks need approval', tone: 'working' };
  if (pull.checkSummary.running > 0) return { group: 'review', label: 'Checks running', tone: 'working' };
  if (pull.reviewStatus === 'approved') return { group: 'ready', label: 'Approved', tone: 'ready' };
  if (pull.mergeRequirements.unresolvedConversations > 0) return { group: 'attention', label: 'In discussion', tone: 'working' };
  if (pull.mergeRequirements.ready) return { group: 'ready', label: 'Ready to merge', tone: 'ready' };
  return { group: 'review', label: 'Awaiting review', tone: 'working' };
}
