import type { RunSummary, WorkflowTrigger } from '@marl/contracts';
import GitBranch from '@lucide/svelte/icons/git-branch';
import GitPullRequest from '@lucide/svelte/icons/git-pull-request';
import MousePointerClick from '@lucide/svelte/icons/mouse-pointer-click';
import Timer from '@lucide/svelte/icons/timer';
import type { IconComponent } from '$lib/ui/icon';

const triggers: Record<WorkflowTrigger, { label: string; icon: IconComponent }> = {
  push: { label: 'Push', icon: GitBranch },
  pull_request: { label: 'Pull', icon: GitPullRequest },
  workflow_dispatch: { label: 'Manual', icon: MousePointerClick },
  schedule: { label: 'Schedule', icon: Timer }
};

export function workflowTrigger(trigger: WorkflowTrigger) {
  return triggers[trigger];
}

const runTriggers: Record<string, string> = {
  push: 'Push',
  pull_request: 'Pull',
  workflow_dispatch: 'Manual',
  retry: 'Retry',
  merge_queue: 'Merge queue',
  schedule: 'Schedule'
};

export function runTriggerLabel(trigger: string) {
  return runTriggers[trigger] ?? trigger;
}

export function runOrigin(run: Pick<RunSummary, 'trigger' | 'actor'>) {
  const by = run.actor ? ` by ${run.actor}` : '';
  if (run.trigger === 'workflow_dispatch') return `Started manually${by}`;
  if (run.trigger === 'retry') return `Retried${by}`;
  if (run.trigger === 'merge_queue') return 'Testing the merge queue';
  return `Triggered by ${run.trigger.replace('_', ' ')}`;
}
