<script lang="ts">
  import type { PullRequestSummary } from '@marl/contracts';
  import ArrowLeft from '@lucide/svelte/icons/arrow-left';
  import CircleCheck from '@lucide/svelte/icons/circle-check';
  import CircleDashed from '@lucide/svelte/icons/circle-dashed';
  import CircleX from '@lucide/svelte/icons/circle-x';
  import Eye from '@lucide/svelte/icons/eye';
  import GitMerge from '@lucide/svelte/icons/git-merge';
  import GitPullRequest from '@lucide/svelte/icons/git-pull-request';
  import GitPullRequestClosed from '@lucide/svelte/icons/git-pull-request-closed';
  import GitPullRequestDraft from '@lucide/svelte/icons/git-pull-request-draft';
  import LoaderCircle from '@lucide/svelte/icons/loader-circle';
  import RotateCcw from '@lucide/svelte/icons/rotate-ccw';
  import LabelPill from '#lib/components/discussion/LabelPill.svelte';
  import WorkItemReference from '#lib/components/discussion/WorkItemReference.svelte';
  import Time from '#lib/components/page/Time.svelte';
  import { pullSignal } from '../pull-signal';

  let { pull, showRepository = false }: { pull: PullRequestSummary; showRepository?: boolean } = $props();

  const signal = $derived(pullSignal(pull));
  const StateIcon = $derived(
    pull.state === 'merged'
      ? GitMerge
      : pull.state === 'closed'
        ? GitPullRequestClosed
        : pull.state === 'draft'
          ? GitPullRequestDraft
          : GitPullRequest
  );
  const tones = {
    working: 'text-brand',
    attention: 'text-danger',
    ready: 'text-success',
    complete: 'text-merged',
    quiet: 'text-ink-faint'
  };
  const review = $derived(
    pull.reviewStatus === 'approved'
      ? { icon: CircleCheck, label: 'Approved', tone: 'text-success' }
      : pull.reviewStatus === 'changes_requested'
        ? { icon: RotateCcw, label: 'Changes requested', tone: 'text-warning' }
        : pull.reviewStatus === 'requested'
          ? { icon: Eye, label: 'Review requested', tone: 'text-ink-muted' }
          : { icon: CircleDashed, label: 'No reviews', tone: 'text-ink-faint' }
  );
  const checks = $derived.by(() => {
    const { total, passed, failed, running } = pull.checkSummary;
    if (!total) return null;
    if (failed) return { icon: CircleX, label: `${failed} failed`, tone: 'text-danger' };
    if (running) return { icon: LoaderCircle, label: `${running} running`, tone: 'text-brand' };
    return { icon: CircleCheck, label: `${passed}/${total}`, tone: 'text-success' };
  });
  const source = $derived(
    pull.sourceRepository &&
      `${pull.sourceRepository.owner}/${pull.sourceRepository.name}` !==
        `${pull.repository.owner}/${pull.repository.name}`
      ? `${pull.sourceRepository.owner}:${pull.sourceBranch}`
      : pull.sourceBranch
  );
  const open = $derived(pull.state !== 'merged' && pull.state !== 'closed');
</script>

<a
  href="/{pull.repository.owner}/{pull.repository.name}/pulls/{pull.number}"
  data-pull-row
  class="group grid grid-cols-[16px_minmax(0,1fr)] items-start gap-x-3 rounded-lg px-3 py-2.5 transition-colors outline-none hover:bg-surface-hover focus-visible:bg-surface-hover focus-visible:shadow-[inset_0_0_0_2px_var(--color-brand)] md:grid-cols-[16px_minmax(0,1fr)_9.5rem_5rem_5.5rem] md:items-center"
>
  <StateIcon size={16} class={['mt-0.5 md:mt-0', tones[signal.tone]]} aria-hidden="true" />
  <span class="min-w-0">
    <span class="sr-only">{signal.label}: </span>
    <span class="flex min-w-0 items-center gap-2">
      <strong class="truncate text-sm font-semibold text-ink-strong group-hover:text-brand">{pull.title}</strong>
      {#each pull.labels.slice(0, 2) as label (label.id)}<span class="hidden shrink-0 sm:inline-flex"
          ><LabelPill name={label.name} color={label.color} size="small" /></span
        >{/each}
    </span>
    <span class="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs text-ink-muted">
      {#if showRepository}<span class="shrink-0 font-medium text-ink"
          >{pull.repository.owner}/{pull.repository.name}</span
        ><span class="shrink-0" aria-hidden="true">·</span>{/if}
      <WorkItemReference kind="pull" number={pull.number} class="shrink-0" />
      <span class="shrink-0" aria-hidden="true">·</span>
      <span class="shrink-0">{pull.authorDisplayName}</span>
      <span class="hidden shrink-0 sm:inline" aria-hidden="true">·</span>
      <span class="hidden min-w-0 items-center gap-1 font-mono text-ink-faint sm:flex"
        ><span class="truncate">{pull.targetBranch}</span><ArrowLeft
          size={11}
          class="shrink-0"
          aria-hidden="true"
        /><span class="truncate">{source}</span></span
      >
    </span>
    <span class="mt-1.5 flex items-center gap-3 text-xs md:hidden">
      {#if open}<span class={['inline-flex items-center gap-1', review.tone]}
          ><review.icon size={13} aria-hidden="true" />{review.label}</span
        >{/if}
      {#if checks}<span class={['inline-flex items-center gap-1', checks.tone]}
          ><checks.icon size={13} aria-hidden="true" />{checks.label}</span
        >{/if}
      <Time value={pull.updatedAt} class="text-ink-faint" />
    </span>
  </span>
  <span class={['hidden items-center gap-1.5 text-xs md:flex', review.tone]}>
    {#if open}<review.icon size={14} aria-hidden="true" />{review.label}{/if}
  </span>
  <span class={['hidden items-center gap-1.5 text-xs tabular-nums md:flex', checks?.tone]}>
    {#if checks}<checks.icon size={14} aria-hidden="true" /><span
        ><span class="sr-only">Checks </span>{checks.label}</span
      >{/if}
  </span>
  <Time value={pull.updatedAt} class="hidden text-right text-xs text-ink-faint md:block" />
</a>
