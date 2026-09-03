import type { PullRequestDetail, PullRequestSummary } from '@marl/contracts';

export type PullSignalTone = 'quiet' | 'working' | 'attention' | 'ready' | 'complete';
export type PullQueueGroup = 'ready' | 'attention' | 'review' | 'draft' | 'complete';

export type PullSignal = {
  group: PullQueueGroup;
  label: string;
  detail: string;
  tone: PullSignalTone;
};

export function pullSignal(pull: PullRequestSummary): PullSignal {
  if (pull.state === 'merged') return { group: 'complete', label: 'Merged', detail: `Landed on ${pull.targetBranch}`, tone: 'complete' };
  if (pull.state === 'closed') return { group: 'complete', label: 'Closed', detail: 'No longer moving forward', tone: 'quiet' };
  if (pull.state === 'draft') return { group: 'draft', label: 'Author working', detail: 'Not ready for review yet', tone: 'quiet' };
  if (pull.state === 'mergeable') return { group: 'ready', label: 'Ready to land', detail: 'Every requirement is met', tone: 'ready' };
  if (pull.checkSummary.failed > 0) {
    return {
      group: 'attention',
      label: 'Checks need attention',
      detail: `${pull.checkSummary.failed} ${pull.checkSummary.failed === 1 ? 'check is' : 'checks are'} failing`,
      tone: 'attention'
    };
  }
  if (pull.reviewStatus === 'changes_requested') return { group: 'attention', label: "Author's move", detail: 'Changes were requested', tone: 'attention' };
  if (pull.checkSummary.running > 0) return { group: 'review', label: 'Checks running', detail: 'Marl is testing this revision', tone: 'working' };
  if (pull.reviewStatus === 'approved') return { group: 'review', label: 'Waiting to land', detail: 'Approved; another requirement remains', tone: 'working' };
  return { group: 'review', label: "Reviewers' move", detail: 'A review can move this forward', tone: 'working' };
}

export function pullDetailSignal(pull: PullRequestDetail, viewerHandle?: string): PullSignal {
  if (pull.state === 'merged' || pull.state === 'closed' || pull.state === 'draft') return pullSignal(pull);
  if (pull.checkSummary.failed > 0) {
    return {
      group: 'attention',
      label: pull.author === viewerHandle ? 'Your move' : "Author's move",
      detail: `${pull.checkSummary.failed} ${pull.checkSummary.failed === 1 ? 'check needs' : 'checks need'} attention`,
      tone: 'attention'
    };
  }
  if (pull.reviewStatus === 'changes_requested') {
    return {
      group: 'attention',
      label: pull.author === viewerHandle ? 'Your move' : "Author's move",
      detail: 'Respond to the requested changes',
      tone: 'attention'
    };
  }
  if (pull.mergeRequirements.unresolvedConversations > 0) {
    const count = pull.mergeRequirements.unresolvedConversations;
    return {
      group: 'attention',
      label: pull.author === viewerHandle ? 'Your move' : 'Conversation needs a response',
      detail: `${count} open ${count === 1 ? 'conversation' : 'conversations'}`,
      tone: 'attention'
    };
  }
  if (pull.checkSummary.running > 0) return { group: 'review', label: 'Marl is checking this revision', detail: 'The next move will be clear when checks finish', tone: 'working' };
  if (pull.mergeRequirements.approvals < pull.mergeRequirements.requiredApprovals) {
    return {
      group: 'review',
      label: pull.author === viewerHandle ? "Reviewers' move" : 'Your review can move this forward',
      detail: `${pull.mergeRequirements.requiredApprovals - pull.mergeRequirements.approvals} more ${pull.mergeRequirements.requiredApprovals - pull.mergeRequirements.approvals === 1 ? 'approval' : 'approvals'} needed`,
      tone: 'working'
    };
  }
  if (pull.mergeRequirements.ready || pull.state === 'mergeable') return { group: 'ready', label: 'Ready to land', detail: `This revision can merge into ${pull.targetBranch}`, tone: 'ready' };
  return { group: 'review', label: 'Waiting on requirements', detail: pull.mergeRequirements.reasons[0] ?? 'Marl is calculating the next move', tone: 'working' };
}
