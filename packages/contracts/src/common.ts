export type Identifier = string;

export interface ApiError {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

export type PullRequestState = 'draft' | 'open' | 'blocked' | 'mergeable' | 'merged' | 'closed';

export type IssueState = 'open' | 'closed';

export type MergeMethod = 'merge' | 'squash' | 'rebase';

export type RunState = 'queued' | 'running' | 'success' | 'failure' | 'canceled';

export type RunCancellationReason = 'developer' | 'superseded';

export type RunnerState = 'idle' | 'busy' | 'offline';

export type SigningMode = 'optional' | 'vigilant' | 'firewall';
