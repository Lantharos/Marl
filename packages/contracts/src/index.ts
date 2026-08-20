export type Identifier = string;

export interface ApiError {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

export interface HealthResponse {
  service: 'marl-api';
  status: 'ok';
}

export type PullRequestState = 'draft' | 'open' | 'blocked' | 'mergeable' | 'merged' | 'closed';
export type MergeMethod = 'merge' | 'squash' | 'rebase';
export type RunState = 'queued' | 'running' | 'success' | 'failure' | 'canceled';
export type RunCancellationReason = 'developer' | 'superseded';
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

export interface PublicProfileRepository extends RepositorySummary {
  defaultBranch: string;
}

export interface PublicUserProfile {
  profile: {
    handle: string;
    displayName: string;
    avatarUrl: string | null;
    bio: string;
    website: string | null;
    joinedAt: string;
  };
  stats: { repositories: number; contributions: number; pullRequests: number };
  contributions: Array<{ date: string; count: number }>;
  repositories: PublicProfileRepository[];
  organizations: Array<{ slug: string; name: string; avatarUrl: string | null; description: string }>;
  activity: Array<{ id: string; title: string; authoredAt: string; owner: string; repository: string }>;
}

export interface PublicOrganizationProfile {
  organization: {
    slug: string;
    name: string;
    avatarUrl: string | null;
    description: string;
    website: string | null;
    kind: 'personal' | 'team';
    createdAt: string;
  };
  stats: { repositories: number; members: number; contributions: number };
  repositories: PublicProfileRepository[];
  members: Array<{ handle: string; displayName: string; avatarUrl: string | null; role: string }>;
  activity: Array<{ id: string; title: string; authoredAt: string; author: string | null; authorAvatarUrl: string | null; repository: string }>;
}

export type PublicIdentityProfile = PublicUserProfile | PublicOrganizationProfile;

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
  authorAvatarUrl?: string | null;
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
    unresolvedConversations: number;
  };
  commits: Array<{ id: string; shortId: string; title: string; author: string; authoredAt: string; signatureStatus: string }>;
  comments: PullRequestComment[];
  reviews: PullRequestReview[];
  checks: CheckSummary[];
  threads: ReviewThread[];
  events: PullRequestEvent[];
  assignees: PullRequestPerson[];
  labels: PullRequestLabel[];
  availableAssignees: PullRequestPerson[];
  availableLabels: PullRequestLabel[];
  locked: boolean;
  canManage: boolean;
  realtimeVersion: number;
  timeline: PullTimelineWindow;
}

export type PullTimelineItem =
  | { sequence: number; kind: 'comment'; createdAt: string; value: PullRequestComment }
  | { sequence: number; kind: 'review'; createdAt: string; value: PullRequestReview }
  | { sequence: number; kind: 'thread'; createdAt: string; value: ReviewThread }
  | { sequence: number; kind: 'event'; createdAt: string; value: PullRequestEvent };

export interface PullTimelineWindow {
  items: PullTimelineItem[];
  total: number;
  hidden: number;
  loadBeforeSequence?: number;
  firstBoundarySequence?: number;
  newestLoadedSequence?: number;
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
  | 'thread_resolved'
  | 'thread_reopened';

export interface PullRequestEvent {
  id: Identifier;
  actor: string;
  kind: PullRequestEventKind;
  details: Record<string, string>;
  createdAt: string;
}

export interface PullRequestPerson {
  id: Identifier;
  handle: string;
  displayName: string;
  avatarUrl?: string | null;
}

export interface PullRequestLabel {
  id: Identifier;
  name: string;
  color: string;
  description: string;
}

export interface PullRequestComment {
  id: Identifier;
  authorId: Identifier;
  author: string;
  authorAvatarUrl?: string | null;
  body: string;
  createdAt: string;
  updatedAt: string;
  deleted: boolean;
  canEdit: boolean;
}

export interface PullRequestReview {
  id: Identifier;
  author: string;
  authorAvatarUrl?: string | null;
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
  startSide: 'old' | 'new';
  startLine: number;
  commitId: string;
  createdAt: string;
  outdated: boolean;
  resolved: boolean;
  comments: Array<{ id: Identifier; authorId: Identifier; author: string; authorAvatarUrl?: string | null; body: string; createdAt: string; updatedAt: string; deleted: boolean; canEdit: boolean }>;
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
  files: Array<{ path: string; oldPath?: string; status: 'added' | 'modified' | 'deleted' | 'renamed'; additions: number; deletions: number; patch: string; patchOmitted?: 'deleted' | 'large' | 'lazy' }>;
  threads?: ReviewThread[];
}

export interface RunSummary {
  id: Identifier;
  number: number;
  repository: Pick<RepositorySummary, 'owner' | 'name'>;
  name: string;
  trigger: string;
  workflowId?: Identifier;
  workflowPath?: string;
  actor?: string;
  branch: string;
  commit: string;
  state: RunState;
  cancellationReason?: RunCancellationReason;
  jobs: number;
  duration?: string;
  queuedAt: string;
}

export type WorkflowTrigger = 'push' | 'workflow_dispatch' | 'pull_request' | 'schedule';
export type WorkflowStatus = 'valid' | 'invalid';

export interface WorkflowSummary {
  id: Identifier;
  name: string;
  path: string;
  source: 'marl' | 'github';
  branch: string;
  commit: string;
  triggers: WorkflowTrigger[];
  status: WorkflowStatus;
  active: boolean;
  error?: string;
  jobs: number;
  runCount: number;
  lastRun?: RunSummary;
  updatedAt: string;
}

export interface WorkflowDetail extends WorkflowSummary {
  runs: RunSummary[];
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
