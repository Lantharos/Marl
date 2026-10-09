<script lang="ts">
  import type { RunDetail } from '@marl/contracts';
  import GitBranch from '@lucide/svelte/icons/git-branch';
  import GitCommitHorizontal from '@lucide/svelte/icons/git-commit-horizontal';
  import RotateCcw from '@lucide/svelte/icons/rotate-ccw';
  import Square from '@lucide/svelte/icons/square';
  import Timer from '@lucide/svelte/icons/timer';
  import Button from '#lib/components/controls/Button.svelte';
  import Time from '#lib/components/page/Time.svelte';
  import { elapsed } from '../duration';
  import { awaitingCheckApproval, runStateLabel } from '../run-state';
  import RunStateIcon from '../RunStateIcon.svelte';
  import { runOrigin } from '../workflow-triggers';

  let {
    run,
    owner,
    repository,
    canAct,
    now,
    busy,
    onaction
  }: {
    run: RunDetail;
    owner: string;
    repository: string;
    canAct: boolean;
    now: number;
    busy: 'cancel' | 'retry' | 'approve' | null;
    onaction: (kind: 'cancel' | 'retry') => void;
  } = $props();
  const active = $derived(run.state === 'queued' || run.state === 'running');
  const awaitingApproval = $derived(awaitingCheckApproval(run));
  const duration = $derived(elapsed(run.startedAt, run.completedAt, now));
  const tone = $derived(
    awaitingApproval
      ? 'text-warning'
      : run.state === 'success'
        ? 'text-success'
        : run.state === 'failure'
          ? 'text-danger'
          : run.state === 'running'
            ? 'text-brand'
            : 'text-ink-muted'
  );
</script>

<header class="mb-6 flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
  <div class="flex min-w-0 gap-3.5">
    <span class="grid size-10.5 shrink-0 place-items-center rounded-xl bg-surface-muted"
      ><RunStateIcon state={run.state} {awaitingApproval} label={runStateLabel(run)} size={20} /></span
    >
    <div class="min-w-0">
      <h1 class="text-2xl font-semibold tracking-tight wrap-anywhere text-ink-strong">
        {run.name} <span class="font-normal text-ink-muted">#{run.number}</span>
      </h1>
      <p class="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm text-ink-muted">
        <span class={['font-semibold capitalize', tone]}>{runStateLabel(run)}</span>
        {#if duration}<span class="inline-flex items-center gap-1 tabular-nums"><Timer size={14} />{duration}</span
          >{/if}
        <span>{runOrigin(run)}</span>
        <span class="inline-flex min-w-0 items-center gap-1 font-mono text-xs text-ink"
          ><GitBranch size={13} class="shrink-0 text-ink-muted" /><span class="truncate">{run.branch}</span></span
        >
        <a
          class="inline-flex items-center gap-1 font-mono text-xs text-ink hover:text-brand"
          href="/{owner}/{repository}/commit/{run.commit}"
          ><GitCommitHorizontal size={13} class="text-ink-muted" />{run.commit.slice(0, 7)}</a
        >
        <Time value={run.queuedAt} class="text-sm text-ink-muted" />
      </p>
    </div>
  </div>
  {#if canAct}
    {#if active}
      <Button loading={busy === 'cancel'} disabled={Boolean(busy)} onclick={() => onaction('cancel')}
        ><Square size={14} />Cancel run</Button
      >
    {:else}
      <Button loading={busy === 'retry'} disabled={Boolean(busy)} onclick={() => onaction('retry')}
        ><RotateCcw size={14} />Run again</Button
      >
    {/if}
  {/if}
</header>
