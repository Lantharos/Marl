import type { IssueDetail, IssueSummary } from '@marl/contracts';

export type IssueQueueGroup = 'motion' | 'decision' | 'unclaimed' | 'complete';

export type IssueSignal = {
  group: IssueQueueGroup;
  label: string;
  detail: string;
  tone: 'quiet' | 'working' | 'attention' | 'complete';
};

export function issueSignal(issue: IssueSummary): IssueSignal {
  if (issue.state === 'closed') return { group: 'complete', label: 'Closed', detail: 'Work is complete', tone: 'complete' };
  if (issue.assignees.length > 0) {
    const owner = issue.assignees[0];
    return {
      group: 'motion',
      label: 'In motion',
      detail: issue.assignees.length === 1 ? `Owned by ${owner.displayName || `@${owner.handle}`}` : `${issue.assignees.length} people own the next step`,
      tone: 'working'
    };
  }
  if (issue.commentCount > 0) return { group: 'decision', label: 'Needs a decision', detail: 'Discussion is active without an owner', tone: 'attention' };
  return { group: 'unclaimed', label: 'Needs an owner', detail: 'No one has taken the next step', tone: 'quiet' };
}

export function issueDetailSignal(issue: IssueDetail): IssueSignal {
  if (issue.state === 'closed') return issueSignal(issue);
  const openPulls = issue.linkedItems.filter((item) => item.kind === 'pull' && !['merged', 'closed'].includes(item.state));
  if (openPulls.length > 0) {
    const pull = openPulls[0];
    return {
      group: 'motion',
      label: 'Change in review',
      detail: `${pull.repository.owner}/${pull.repository.name}!${pull.number} is moving this work forward`,
      tone: 'working'
    };
  }
  const mergedPulls = issue.linkedItems.filter((item) => item.kind === 'pull' && item.state === 'merged');
  if (mergedPulls.length > 0) return { group: 'decision', label: 'Implementation landed', detail: 'Confirm the outcome or close this issue', tone: 'attention' };
  return issueSignal(issue);
}
