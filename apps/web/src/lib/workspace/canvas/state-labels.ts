import type { PullRequestState } from '@marl/contracts';

const pullStates: Record<PullRequestState, string> = {
  draft: 'Draft',
  open: 'Open',
  blocked: 'Open',
  mergeable: 'Open',
  merged: 'Merged',
  closed: 'Closed'
};

export function pullStateLabel(state: PullRequestState) {
  return pullStates[state];
}

export function issueStateLabel(state: string) {
  return state === 'closed' ? 'Closed' : 'Open';
}
