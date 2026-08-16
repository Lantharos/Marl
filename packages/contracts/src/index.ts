export type Identifier = string;

export interface ApiError {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

export interface HealthResponse {
  service: 'sty-api';
  status: 'ok';
}

export type PullRequestState = 'draft' | 'open' | 'blocked' | 'mergeable' | 'merged' | 'closed';
export type MergeMethod = 'merge' | 'squash' | 'rebase';
export type RunState = 'queued' | 'running' | 'success' | 'failure' | 'canceled';
export type RunnerState = 'idle' | 'busy' | 'offline';

export interface RepositorySummary {
  id: Identifier;
  owner: string;
  name: string;
  description: string;
  visibility: 'public' | 'private';
  updatedAt: string;
  defaultBranch?: string;
  archivedAt?: string;
  deletionScheduledAt?: string;
  language?: string;
}

export interface BranchSummary {
  name: string;
  commit: string;
  title: string;
  updatedAt: string;
  isDefault: boolean;
  ahead: number;
  behind: number;
}

export interface CommitSummary {
  id: string;
  shortId: string;
  title: string;
  author: string;
  authoredAt: string;
  verified: boolean;
}

export interface RepositoryTreeEntry {
  path: string;
  name: string;
  kind: 'file' | 'folder';
  language?: string;
  size?: string;
  message: string;
  updatedAt: string;
}

export interface PullRequestSummary {
  id: Identifier;
  number: number;
  repository: Pick<RepositorySummary, 'owner' | 'name'>;
  title: string;
  author: string;
  authorAvatar?: string;
  sourceBranch: string;
  targetBranch: string;
  state: PullRequestState;
  reviewStatus: 'none' | 'requested' | 'approved' | 'changes_requested';
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
  };
  commits: Array<{ id: string; shortId: string; title: string; author: string; authoredAt: string }>;
  comments: PullRequestComment[];
  reviews: PullRequestReview[];
  checks: CheckSummary[];
  threads: ReviewThread[];
}

export interface PullRequestComment {
  id: Identifier;
  authorId: Identifier;
  author: string;
  body: string;
  createdAt: string;
  updatedAt: string;
  deleted: boolean;
  canEdit: boolean;
}

export interface PullRequestReview {
  id: Identifier;
  author: string;
  state: 'commented' | 'approved' | 'changes_requested';
  body: string;
  commitId: string;
  createdAt: string;
}

export interface ReviewThread {
  id: Identifier;
  path: string;
  side: 'old' | 'new';
  line: number;
  commitId: string;
  createdAt: string;
  outdated: boolean;
  resolved: boolean;
  comments: Array<{ id: Identifier; authorId: Identifier; author: string; body: string; createdAt: string; updatedAt: string; deleted: boolean; canEdit: boolean }>;
}

export interface CheckSummary {
  id: Identifier;
  name: string;
  state: RunState;
  summary: string;
  detailsUrl?: string;
  updatedAt: string;
}

export interface PullRequestDiff {
  base: string;
  head: string;
  mergeBase: string;
  files: Array<{ path: string; oldPath?: string; status: 'added' | 'modified' | 'deleted' | 'renamed'; additions: number; deletions: number; patch: string }>;
}

export interface RunSummary {
  id: Identifier;
  number: number;
  repository: Pick<RepositorySummary, 'owner' | 'name'>;
  name: string;
  trigger: string;
  actor?: string;
  branch: string;
  commit: string;
  state: RunState;
  jobs: number;
  duration?: string;
  queuedAt: string;
}

export interface RunJob {
  id: Identifier;
  key: string;
  name: string;
  state: RunState;
  requiredLabels: string[];
  runner?: Pick<RunnerSummary, 'id' | 'name'>;
  attempt: number;
  exitCode?: number;
  startedAt?: string;
  completedAt?: string;
  logBytes: number;
  artifacts: Array<{ id: Identifier; name: string; byteSize: number; contentType: string }>;
}

export interface RunDetail extends RunSummary {
  jobsDetail: RunJob[];
  startedAt?: string;
  completedAt?: string;
}

export interface RunnerSummary {
  id: Identifier;
  name: string;
  state: RunnerState;
  labels: string[];
  activeJobs: number;
  concurrency: number;
  lastSeenAt: string;
  platform?: string;
  architecture?: string;
  version?: string;
}

export interface RunnerStep {
  name: string;
  run: string;
  shell?: string;
  environment?: Record<string, string>;
  workingDirectory?: string;
  timeoutMinutes?: number;
  continueOnError?: boolean;
}

export interface RunnerService {
  name: string;
  image: string;
  environment: Record<string, string>;
}

export interface RunnerJobLease {
  id: Identifier;
  leaseToken: string;
  run: { id: Identifier; number: number; name: string };
  repository: { owner: string; name: string; cloneUrl: string };
  branch: string;
  commitId: string;
  steps: RunnerStep[];
  environment: Record<string, string>;
  artifactPaths: string[];
  runtime: {
    image: string;
    timeoutMinutes: number;
    services: RunnerService[];
  };
  leaseExpiresAt: string;
}
