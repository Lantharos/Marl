import type { PullRequestDetail } from '@marl/contracts';

export type RequirementOutcome = 'met' | 'optional' | 'waiting' | 'blocked';
export type Requirement = {
  key: 'reviews' | 'checks' | 'conversations' | 'conflicts';
  outcome: RequirementOutcome;
  label: string;
};

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;

function reviews(pull: PullRequestDetail): Requirement {
  const { approvals, requiredApprovals } = pull.mergeRequirements;
  if (pull.reviewStatus === 'changes_requested')
    return { key: 'reviews', outcome: 'blocked', label: 'Changes requested' };
  if (approvals < requiredApprovals)
    return {
      key: 'reviews',
      outcome: 'waiting',
      label: approvals
        ? `${approvals} of ${requiredApprovals} approvals`
        : `Needs ${plural(requiredApprovals, 'approval')}`
    };
  return {
    key: 'reviews',
    outcome: 'met',
    label: approvals ? `Approved by ${plural(approvals, 'reviewer')}` : 'No approval required'
  };
}

function checks(pull: PullRequestDetail): Requirement {
  const { total, passed, failed, running } = pull.checkSummary;
  const { checksPass } = pull.mergeRequirements;
  if (pull.checksApproval.waiting)
    return {
      key: 'checks',
      outcome: 'waiting',
      label: `${plural(pull.checksApproval.waiting, 'run')} awaiting approval`
    };
  if (failed)
    return {
      key: 'checks',
      outcome: checksPass ? 'optional' : 'blocked',
      label: `${failed} of ${total} checks failed`
    };
  if (running)
    return {
      key: 'checks',
      outcome: checksPass ? 'optional' : 'waiting',
      label: `${running} of ${total} checks running`
    };
  if (!checksPass) return { key: 'checks', outcome: 'waiting', label: 'Required checks have not reported' };
  return { key: 'checks', outcome: 'met', label: total ? `${plural(passed, 'check')} passed` : 'No checks reported' };
}

function conversations(pull: PullRequestDetail): Requirement {
  const { unresolvedConversations, conversationsPass } = pull.mergeRequirements;
  if (!unresolvedConversations) return { key: 'conversations', outcome: 'met', label: 'Conversations resolved' };
  return {
    key: 'conversations',
    outcome: conversationsPass ? 'optional' : 'blocked',
    label: `${plural(unresolvedConversations, 'unresolved conversation')}`
  };
}

function conflicts(pull: PullRequestDetail, conflicted: boolean | null): Requirement {
  if (conflicted === null) return { key: 'conflicts', outcome: 'waiting', label: 'Checking for conflicts' };
  return conflicted
    ? { key: 'conflicts', outcome: 'blocked', label: `Conflicts with ${pull.targetBranch}` }
    : { key: 'conflicts', outcome: 'met', label: `No conflicts with ${pull.targetBranch}` };
}

export function pullRequirements(pull: PullRequestDetail, conflicted: boolean | null): Requirement[] {
  return [reviews(pull), checks(pull), conversations(pull), conflicts(pull, conflicted)];
}

export type PullOutcome = {
  tone: 'merged' | 'closed' | 'draft' | 'ready' | 'blocked' | 'waiting';
  label: string;
  detail?: string;
};

function list(items: string[]) {
  return items.length > 1 ? `${items.slice(0, -1).join(', ')} and ${items.at(-1)}` : items[0];
}

export function pullOutcome(pull: PullRequestDetail, requirements: Requirement[]): PullOutcome {
  if (pull.state === 'merged')
    return {
      tone: 'merged',
      label: 'Merged',
      detail: `Into ${pull.targetBranch}${pull.mergedCommitId ? ` as ${pull.mergedCommitId.slice(0, 7)}` : ''}`
    };
  if (pull.state === 'closed') return { tone: 'closed', label: 'Closed', detail: 'Closed without merging' };
  if (pull.state === 'draft')
    return { tone: 'draft', label: 'Draft', detail: 'Approvals and merging start once it is ready for review' };
  if (requirements.some((requirement) => requirement.outcome === 'blocked'))
    return { tone: 'blocked', label: 'Not ready to merge' };
  const waiting = requirements.flatMap((requirement) =>
    requirement.outcome === 'waiting' && requirement.key !== 'conflicts' ? [requirement.key] : []
  );
  if (waiting.length) return { tone: 'waiting', label: `Waiting on ${list(waiting)}` };
  return { tone: 'ready', label: 'Ready to merge' };
}
