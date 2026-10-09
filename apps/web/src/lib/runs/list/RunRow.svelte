<script lang="ts">
  import type { RunSummary } from '@marl/contracts';
  import GitBranch from '@lucide/svelte/icons/git-branch';
  import ListRow from '#lib/components/list/ListRow.svelte';
  import Time from '#lib/components/page/Time.svelte';
  import { elapsed } from '../duration';
  import { awaitingCheckApproval, runStateLabel } from '../run-state';
  import { runTriggerLabel } from '../workflow-triggers';
  import RunStateIcon from '../RunStateIcon.svelte';

  let { run, showRepository = false, now }: { run: RunSummary; showRepository?: boolean; now: number } = $props();
  const duration = $derived(elapsed(run.startedAt, run.completedAt, now));
  const origin = $derived(
    [
      showRepository && `${run.repository.owner}/${run.repository.name}`,
      `${runTriggerLabel(run.trigger)}${run.actor ? ` by ${run.actor}` : ''}`
    ]
      .filter(Boolean)
      .join(' · ')
  );
</script>

<ListRow
  class="group grid grid-cols-[18px_minmax(0,1fr)_auto] items-center gap-x-3 py-2.5 sm:grid-cols-[18px_minmax(0,1.3fr)_minmax(0,1fr)_96px]"
  href="/{run.repository.owner}/{run.repository.name}/runs/{run.number}"
>
  <RunStateIcon state={run.state} awaitingApproval={awaitingCheckApproval(run)} label={runStateLabel(run)} />
  <span class="min-w-0">
    <span class="flex min-w-0 items-baseline gap-1.5">
      <strong class="truncate text-sm font-semibold text-ink-strong group-hover:text-brand">{run.name}</strong>
      <span class="shrink-0 text-sm text-ink-muted tabular-nums">#{run.number}</span>
    </span>
    <span class="block truncate text-xs text-ink-muted"
      >{origin}<span class="sm:hidden">{` · ${run.branch}`}</span></span
    >
  </span>
  <span class="hidden min-w-0 items-center gap-1.5 font-mono text-xs text-ink-muted sm:flex">
    <GitBranch size={13} class="shrink-0" /><span class="truncate text-ink">{run.branch}</span><span
      class="shrink-0 text-ink-faint">{run.commit.slice(0, 7)}</span
    >
  </span>
  <span class="grid justify-items-end text-xs text-ink-muted">
    {#if duration}<span class="text-ink tabular-nums">{duration}</span>{/if}
    <Time value={run.queuedAt} class="text-xs whitespace-nowrap text-ink-muted" />
  </span>
</ListRow>
