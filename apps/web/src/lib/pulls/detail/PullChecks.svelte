<script lang="ts">
  import type { PullRequestDetail } from '@marl/contracts';
  import CircleDot from '@lucide/svelte/icons/circle-dot';
  import ExternalLink from '@lucide/svelte/icons/external-link';
  import ShieldCheck from '@lucide/svelte/icons/shield-check';
  import Button from '#lib/components/controls/Button.svelte';
  import EmptyState from '#lib/components/feedback/EmptyState.svelte';
  import RunStateIcon from '#lib/runs/RunStateIcon.svelte';
  import { runTriggerLabel } from '#lib/runs/workflow-triggers.js';

  let { pull, approving, onApprove }: { pull: PullRequestDetail; approving: boolean; onApprove: () => void } = $props();
  const waiting = $derived(pull.checksApproval.waiting);
  const summary = $derived.by(() => {
    const { total, passed, failed, running } = pull.checkSummary;
    if (!total) return 'No checks reported';
    if (failed) return `${failed} of ${total} checks failed`;
    if (running) return `${running} of ${total} checks running`;
    return `${passed} of ${total} checks passed`;
  });
</script>

<section class="rounded-2xl bg-surface-muted/60 p-2 sm:p-2.5" aria-label="Checks">
  <header class="flex flex-wrap items-baseline gap-x-2 px-2 pt-1 pb-2.5">
    <h2 class="text-sm font-semibold text-ink-strong">{summary}</h2>
    <span class="text-xs text-ink-muted"
      >on <code class="font-mono text-ink">{pull.sourceCommitId.slice(0, 7)}</code>. Required checks must pass on the
      latest commit.</span
    >
  </header>
  {#if waiting}
    <div class="mb-2 flex flex-wrap items-center gap-3 rounded-xl bg-warning-soft px-4 py-3 text-sm text-warning">
      <ShieldCheck size={16} class="shrink-0" />
      <span class="mr-auto">{waiting} {waiting === 1 ? 'run awaits' : 'runs await'} maintainer approval.</span>
      {#if pull.checksApproval.canApprove}<Button size="small" loading={approving} onclick={onApprove}
          >Approve checks</Button
        >{/if}
    </div>
  {/if}
  {#if pull.checks.length}
    <div class="divide-y divide-line-subtle surface">
      {#each pull.checks as check (check.id)}
        {@const detail = [check.run && runTriggerLabel(check.run.trigger), check.summary].filter(Boolean).join(' · ')}
        <svelte:element
          this={check.run ? 'a' : 'article'}
          href={check.run ? `/${pull.repository.owner}/${pull.repository.name}/runs/${check.run.number}` : undefined}
          class={[
            'group grid grid-cols-[18px_minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 first:rounded-t-xl last:rounded-b-xl',
            check.run && 'transition-colors hover:bg-surface-hover'
          ]}
        >
          <RunStateIcon state={check.state} />
          <div class="min-w-0">
            <strong class="block truncate text-sm font-semibold text-ink-strong group-hover:text-brand"
              >{check.name}</strong
            >
            {#if detail}<p class="mt-0.5 truncate text-xs text-ink-muted">{detail}</p>{/if}
          </div>
          {#if check.run}<span class="text-xs text-ink-muted tabular-nums">Run #{check.run.number}</span
            >{:else if check.detailsUrl}<a
              class="inline-flex items-center gap-1 text-xs font-medium text-ink-muted hover:text-brand"
              href={check.detailsUrl}>Details<ExternalLink size={12} /></a
            >{:else}<span class="text-xs text-ink-muted capitalize">{check.state}</span>{/if}
        </svelte:element>
      {/each}
    </div>
  {:else if !waiting}
    <div class="surface">
      <EmptyState
        compact
        icon={CircleDot}
        title="No checks reported"
        description="Push a workflow or connect a runner to report checks."
      />
    </div>
  {/if}
</section>
