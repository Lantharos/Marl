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

export type ReportSubjectType =
  'repository' | 'issue' | 'pull' | 'issue_comment' | 'pull_comment' | 'review_comment' | 'user';

export type ReportReason =
  'spam' | 'malware' | 'harassment' | 'copyright' | 'private_information' | 'illegal' | 'other';

export interface AbuseReport {
  id: Identifier;
  subjectType: ReportSubjectType;
  reason: ReportReason;
  details: string;
  state: 'open' | 'actioned' | 'dismissed';
  reporter: string;
  createdAt: string;
  subject: { title: string; excerpt: string; href: string; author: string | null; repository: string | null } | null;
}

export type WebhookEvent = 'push' | 'pull' | 'review' | 'issue' | 'comment' | 'release' | 'run';
export type WebhookFormat = 'json' | 'slack' | 'discord';

export interface Webhook {
  id: Identifier;
  url: string;
  format: WebhookFormat;
  events: WebhookEvent[];
  active: boolean;
  createdAt: string;
  lastDelivery: { status: 'pending' | 'delivered' | 'failed'; responseStatus: number | null; createdAt: string } | null;
}

export interface WebhookDelivery {
  id: Identifier;
  event: WebhookEvent;
  action: string;
  status: 'pending' | 'delivered' | 'failed';
  responseStatus: number | null;
  responseExcerpt: string | null;
  attempts: number;
  durationMs: number | null;
  createdAt: string;
}
