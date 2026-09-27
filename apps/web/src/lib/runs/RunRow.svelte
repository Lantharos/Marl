<script lang="ts">
  import type { RunSummary } from '@marl/contracts';
  import GitBranch from '@lucide/svelte/icons/git-branch';
  import Time from '$lib/components/page/Time.svelte';
  import { awaitingCheckApproval, runStateLabel } from './run-state';
  import { runOrigin } from './workflow-triggers';
  import RunStateIcon from './RunStateIcon.svelte';

  let {
    run,
    showRepository = true,
    inWorkflow = false
  }: { run: RunSummary; showRepository?: boolean; inWorkflow?: boolean } = $props();
  const label = $derived(runStateLabel(run));
</script>

<a
  class="group grid grid-cols-[20px_minmax(0,1fr)_auto] items-start gap-3 rounded-lg px-3 py-3 transition-colors hover:bg-surface-hover"
  href="/{run.repository.owner}/{run.repository.name}/runs/{run.number}"
>
  <span class="mt-0.5"
    ><RunStateIcon state={run.state} awaitingApproval={awaitingCheckApproval(run)} {label} size={18} /></span
  >
  <span class="min-w-0">
    <strong class="block truncate text-base font-semibold text-ink-strong group-hover:text-brand"
      >{inWorkflow ? `Run #${run.number}` : run.name}</strong
    >
    <span class="mt-0.5 block truncate text-xs text-ink-muted"
      >{#if inWorkflow}{runOrigin(run)}{:else}{#if showRepository}{run.repository.owner}/{run.repository.name} ·
        {/if}run #{run.number}{/if} · <Time value={run.queuedAt} class="text-ink-muted" /></span
    >
    <span
      class="mt-1.5 inline-flex max-w-full items-center gap-1.5 rounded bg-surface-muted px-1.5 py-0.5 font-mono text-xs text-ink-muted"
      ><GitBranch size={12} class="shrink-0" /><span class="truncate">{run.branch}</span><span class="text-ink-faint"
        >{run.commit.slice(0, 7)}</span
      ></span
    >
  </span>
  <span class="grid justify-items-end gap-1 text-right">
    <span class="text-xs font-semibold text-ink capitalize">{label}</span>
    <span class="text-xs text-ink-muted">{run.jobs} {run.jobs === 1 ? 'job' : 'jobs'}</span>
  </span>
</a>
