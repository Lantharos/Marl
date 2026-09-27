import type { Identifier, RunCancellationReason, RunState, RunnerState } from './common';
import type { RepositorySummary } from './repositories';

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
  approvalRequired: boolean;
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
  artifacts: Array<{
    id: Identifier;
    name: string;
    byteSize: number;
    contentType: string;
  }>;
}

export interface RunDetail extends RunSummary {
  canApproveChecks?: boolean;
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
  maskValues: string[];
  artifactPaths: string[];
  runtime: {
    image: string;
    timeoutMinutes: number;
    services: RunnerService[];
  };
  leaseExpiresAt: string;
}
