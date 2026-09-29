import type { IdentityKind } from '../people/identity';
import type { Identifier, MergeMethod, PullRequestState, RunState } from '../common';
import type { RepositorySummary } from '../code/repositories';
import type { LinkedWorkItem, WorkItemLabel, WorkItemPerson, WorkItemReferenceEvent } from './work-items';

export interface PullRequestSummary {
  id: Identifier;
  number: number;
  repository: Pick<RepositorySummary, 'owner' | 'name'>;
  title: string;
  author: string;
  authorDisplayName: string;
  authorAvatarUrl?: string | null;
  authorKind?: IdentityKind;
  sourceBranch: string;
  sourceRepository?: { owner: string; name: string };
  targetBranch: string;
  state: PullRequestState;
  reviewStatus: 'none' | 'requested' | 'approved' | 'changes_requested';
  labels: WorkItemLabel[];
  checkSummary: {
    total: number;
    passed: number;
    failed: number;
    running: number;
  };
  updatedAt: string;
}

export interface PullRequestDetail extends PullRequestSummary {
  body: string;
  bodyHtml: string;
  bodyText: string;
  sourceCommitId: string;
  targetCommitId: string;
  authorId: Identifier;
  createdAt: string;
  mergedCommitId?: string;
  mergeMethod?: MergeMethod;
  allowedMergeMethods: MergeMethod[];
  mergeRequirements: {
    ready: boolean;
    reasons: string[];
    approvals: number;
    requiredApprovals: number;
    checksPass: boolean;
    conversationsPass: boolean;
    unresolvedConversations: number;
  };
  commits: Array<{
    id: string;
    shortId: string;
    title: string;
    author: string;
    authorHandle?: string | null;
    authorDisplayName?: string | null;
    authorAvatarUrl?: string | null;
    authoredAt: string;
    signatureStatus: string;
  }>;
  checks: CheckSummary[];
  assignees: WorkItemPerson[];
  availableAssignees: WorkItemPerson[];
  availableLabels: WorkItemLabel[];
  locked: boolean;
  canManage: boolean;
  canMerge: boolean;
  checksApproval: { waiting: number; canApprove: boolean };
  mergeQueue: MergeQueueStatus;
  canModerate: boolean;
  realtimeVersion: number;
  linkedItems: LinkedWorkItem[];
  timeline: PullTimelineWindow;
  stack: PullStack;
  viewerLastReview: { commitId: string; createdAt: string } | null;
}

export type PullTimelineItem =
  | {
      sequence: number;
      kind: 'comment';
      createdAt: string;
      value: PullRequestComment;
    }
  | {
      sequence: number;
      kind: 'review';
      createdAt: string;
      value: PullRequestReview;
    }
  | { sequence: number; kind: 'thread'; createdAt: string; value: ReviewThread }
  | {
      sequence: number;
      kind: 'event';
      createdAt: string;
      value: PullRequestEvent;
    }
  | {
      sequence: number;
      kind: 'reference';
      createdAt: string;
      value: WorkItemReferenceEvent;
    };

export interface PullRevisionSummary {
  sequence: number;
  number: number;
  commitId: string;
  title: string;
  actor: string;
  actorDisplayName: string;
  createdAt: string;
  commitCount: number;
  activityCount: number;
  conversationCount: number;
  reviewState: 'none' | 'commented' | 'approved' | 'changes_requested';
  forcePushed: boolean;
  current: boolean;
}

export interface PullTimelineWindow {
  items: PullTimelineItem[];
  total: number;
  revisions: PullRevisionSummary[];
}

export interface PullRevisionWindow {
  sequence: number;
  items: PullTimelineItem[];
}

export interface PullRealtimeUpdate {
  id: Identifier;
  pullId: Identifier;
  version: number;
  kind: string;
  payload: Record<string, unknown>;
  createdAt: string;
}

export type PullRequestEventKind =
  | 'title_changed'
  | 'description_changed'
  | 'locked'
  | 'unlocked'
  | 'assigned'
  | 'unassigned'
  | 'label_added'
  | 'label_removed'
  | 'ready'
  | 'closed'
  | 'reopened'
  | 'merged'
  | 'commits_added'
  | 'head_updated'
  | 'force_pushed'
  | 'thread_resolved'
  | 'thread_reopened'
  | 'retargeted'
  | 'queued'
  | 'dequeued';

export interface PullRequestEvent {
  id: Identifier;
  actor: string;
  actorDisplayName: string;
  kind: PullRequestEventKind;
  details: Record<string, string>;
  createdAt: string;
}

export interface PullRequestComment {
  id: Identifier;
  authorId: Identifier;
  author: string;
  authorDisplayName: string;
  authorAvatarUrl?: string | null;
  authorKind?: IdentityKind;
  body: string;
  bodyHtml: string;
  createdAt: string;
  updatedAt: string;
  deleted: boolean;
  canEdit: boolean;
}

export interface PullRequestReview {
  id: Identifier;
  authorId: Identifier;
  author: string;
  authorDisplayName: string;
  authorAvatarUrl?: string | null;
  authorKind?: IdentityKind;
  state: 'commented' | 'approved' | 'changes_requested';
  body: string;
  bodyHtml: string;
  commitId: string;
  carriedFromReviewId?: Identifier | null;
  createdAt: string;
}

export interface ReviewThread {
  id: Identifier;
  path: string;
  side: 'old' | 'new';
  line: number;
  startSide: 'old' | 'new';
  startLine: number;
  commitId: string;
  createdAt: string;
  outdated: boolean;
  resolved: boolean;
  comments: Array<{
    id: Identifier;
    authorId: Identifier;
    author: string;
    authorDisplayName: string;
    authorAvatarUrl?: string | null;
    authorKind?: IdentityKind;
    body: string;
    bodyHtml: string;
    createdAt: string;
    updatedAt: string;
    deleted: boolean;
    canEdit: boolean;
  }>;
}

export interface CheckSummary {
  id: Identifier;
  name: string;
  state: RunState;
  summary: string;
  producerWorkflowId: Identifier;
  producerJobKey: string;
  detailsUrl?: string;
  run: { number: number; trigger: string } | null;
  updatedAt: string;
}

export interface PullRequestDiff {
  base: string;
  head: string;
  mergeBase: string;
  files: Array<{
    path: string;
    oldPath?: string;
    status: 'added' | 'modified' | 'deleted' | 'renamed';
    additions: number;
    deletions: number;
    patch: string;
    patchOmitted?: 'deleted' | 'large' | 'lazy';
  }>;
  threads?: ReviewThread[];
}

export interface PullStack {
  base: { number: number; title: string; state: string } | null;
  dependents: Array<{ number: number; title: string; state: string }>;
}

export interface MergeQueueEntry {
  number: number;
  title: string;
  author: string;
  authorDisplayName: string;
  authorAvatarUrl: string | null;
  enqueuedBy: string;
  enqueuedAt: string;
  state: 'queued' | 'testing' | 'merging';
  position: number;
}

export interface MergeQueueStatus {
  enabled: boolean;
  entry: Pick<MergeQueueEntry, 'state' | 'position' | 'enqueuedBy' | 'enqueuedAt'> | null;
}
