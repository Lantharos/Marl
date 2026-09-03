import type { IssueDetail, IssueSummary } from '@marl/contracts';

export type IssueQueueGroup = 'motion' | 'decision' | 'unclaimed' | 'complete';

export type IssueSignal = {
  group: IssueQueueGroup;
  label: string;
  tone: 'quiet' | 'working' | 'attention' | 'complete';
};

export function issueSignal(issue: IssueSummary): IssueSignal {
  if (issue.state === 'closed') return { group: 'complete', label: 'Closed', tone: 'complete' };
  if (issue.assignees.length > 0) {
    return {
      group: 'motion',
      label: 'In motion',
      tone: 'working'
    };
  }
  if (issue.commentCount > 0) return { group: 'decision', label: 'Needs a decision', tone: 'attention' };
  return { group: 'unclaimed', label: 'Needs an owner', tone: 'quiet' };
}

export function issueDetailSignal(issue: IssueDetail): IssueSignal {
  if (issue.state === 'closed') return issueSignal(issue);
  const openPulls = issue.linkedItems.filter((item) => item.kind === 'pull' && !['merged', 'closed'].includes(item.state));
  if (openPulls.length > 0) {
    const pull = openPulls[0];
    return {
      group: 'motion',
      label: 'Change in review',
      tone: 'working'
    };
  }
  const mergedPulls = issue.linkedItems.filter((item) => item.kind === 'pull' && item.state === 'merged');
  if (mergedPulls.length > 0) return { group: 'decision', label: 'Implementation landed', tone: 'attention' };
  return issueSignal(issue);
}
