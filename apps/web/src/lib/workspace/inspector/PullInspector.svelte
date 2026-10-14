<script lang="ts">
  import { untrack } from 'svelte';
  import ArrowLeft from '@lucide/svelte/icons/arrow-left';
  import Check from '@lucide/svelte/icons/check';
  import CircleAlert from '@lucide/svelte/icons/circle-alert';
  import CircleCheck from '@lucide/svelte/icons/circle-check';
  import CircleDashed from '@lucide/svelte/icons/circle-dashed';
  import FileDiff from '@lucide/svelte/icons/file-diff';
  import GitMerge from '@lucide/svelte/icons/git-merge';
  import GitPullRequestClosed from '@lucide/svelte/icons/git-pull-request-closed';
  import GitPullRequestDraft from '@lucide/svelte/icons/git-pull-request-draft';
  import X from '@lucide/svelte/icons/x';
  import { buttonClass } from '#lib/components/controls/button-styles.js';
  import WorkItemMetadata from '#lib/components/discussion/WorkItemMetadata.svelte';
  import Kbd from '#lib/components/page/Kbd.svelte';
  import PullLifecycleActions from '#lib/pulls/summary/PullLifecycleActions.svelte';
  import { pullOutcome, pullRequirements, type PullOutcome } from '#lib/pulls/summary/pull-requirements.js';
  import RunStateIcon from '#lib/runs/RunStateIcon.svelte';
  import { reviewHref } from '../store/refs';
  import type { PullEntry } from '../store/pull-entry.svelte';
  import InspectorSection from './InspectorSection.svelte';
  import LinkedWork from './LinkedWork.svelte';

  let { entry }: { entry: PullEntry } = $props();
  const pageState = $derived(entry.state!);
  const pull = $derived(pageState.pull);
  const active = $derived(['open', 'mergeable', 'blocked'].includes(pull.state));
  const heads = $derived(active ? `${pull.targetCommitId}:${pull.sourceCommitId}` : null);
  const conflicted = $derived(entry.mergeability.checked ? entry.mergeability.conflicted : null);
  const requirements = $derived(active ? pullRequirements(pull, conflicted) : []);
  const outcome = $derived(pullOutcome(pull, requirements));
  const headlines: Record<PullOutcome['tone'], { icon: typeof Check; tone: string }> = {
    merged: { icon: GitMerge, tone: 'text-merged' },
    closed: { icon: GitPullRequestClosed, tone: 'text-ink-muted' },
    draft: { icon: GitPullRequestDraft, tone: 'text-ink-muted' },
    ready: { icon: CircleCheck, tone: 'text-success' },
    blocked: { icon: CircleAlert, tone: 'text-danger' },
    waiting: { icon: CircleDashed, tone: 'text-brand' }
  };
  const headline = $derived(headlines[outcome.tone]);
  const outcomeIcons = { met: Check, optional: CircleAlert, waiting: CircleDashed, blocked: X };
  const outcomeTones = {
    met: 'text-success',
    optional: 'text-warning',
    waiting: 'text-ink-faint',
    blocked: 'text-danger'
  };

  $effect(() => {
    if (!heads) return;
    const [base, head] = heads.split(':');
    return untrack(() => entry.checkMergeability(base, head));
  });
</script>

<InspectorSection>
  <div class="flex items-start gap-2.5">
    <headline.icon size={18} class={['mt-0.5 shrink-0', headline.tone]} aria-hidden="true" />
    <div class="min-w-0">
      <strong class="block text-md font-semibold text-ink-strong">{outcome.label}</strong>
      {#if outcome.detail}<p class="mt-0.5 text-xs text-ink-muted">{outcome.detail}</p>{/if}
    </div>
  </div>
  {#if requirements.length}
    <ul class="mt-3 grid gap-1.5" aria-label="Merge requirements">
      {#each requirements as requirement (requirement.key)}
        {@const Icon = outcomeIcons[requirement.outcome]}
        <li class="flex items-center gap-2.5 text-sm">
          <Icon size={14} class={outcomeTones[requirement.outcome]} aria-hidden="true" />
          <span class={requirement.outcome === 'met' ? 'text-ink-muted' : 'text-ink-strong'}>{requirement.label}</span>
        </li>
      {/each}
    </ul>
  {/if}
  <div class="mt-4 grid gap-2">
    {#if active}<a
        class={[buttonClass('secondary', 'medium', false, true), 'justify-between']}
        href={reviewHref(entry.ref)}
        ><span class="inline-flex items-center gap-1.5"><FileDiff size={15} />Review changes</span><Kbd>R</Kbd></a
      >{/if}
    <div class="-mx-1">
      {#key pull.sourceCommitId}<PullLifecycleActions
          conflicted={entry.mergeability.conflicted}
          {pull}
          busy={pageState.busy}
          approvingChecks={pageState.approvingChecks}
          bind:mergeMethod={pageState.mergeMethod}
          onAction={pageState.act}
          onApproveChecks={pageState.approveChecks}
        />{/key}
    </div>
  </div>
</InspectorSection>

<InspectorSection title="Branches">
  <p class="flex min-w-0 items-center gap-1.5 font-mono text-xs text-ink">
    <span class="truncate">{pull.targetBranch}</span><ArrowLeft size={12} class="shrink-0 text-ink-faint" /><span
      class="truncate">{pull.sourceBranch}</span
    >
  </p>
  <p class="mt-1.5 text-xs text-ink-muted">
    {pull.commits.length}
    {pull.commits.length === 1 ? 'commit' : 'commits'} ·
    <code class="font-mono">{pull.sourceCommitId.slice(0, 7)}</code>
  </p>
</InspectorSection>

{#if pull.checks.length}
  <InspectorSection title="Checks">
    <ul class="grid gap-1.5">
      {#each pull.checks as check (check.id)}
        <li class="flex min-w-0 items-center gap-2 text-sm">
          <RunStateIcon state={check.state} size={14} />
          <span class="truncate text-ink">{check.name}</span>
        </li>
      {/each}
    </ul>
  </InspectorSection>
{/if}

<LinkedWork items={pull.linkedItems} />

<InspectorSection>
  <WorkItemMetadata
    item={pull}
    busy={pageState.busy}
    onUpdate={pageState.updateMetadata}
    onCreateLabel={pageState.createLabel}
  />
</InspectorSection>
