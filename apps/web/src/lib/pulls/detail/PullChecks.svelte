<script lang="ts">
  import type { PullRequestDetail } from '@marl/contracts';
  import CircleDot from '@lucide/svelte/icons/circle-dot';
  import ExternalLink from '@lucide/svelte/icons/external-link';
  import ShieldCheck from '@lucide/svelte/icons/shield-check';
  import Button from '$lib/components/controls/Button.svelte';
  import EmptyState from '$lib/components/feedback/EmptyState.svelte';
  import RunStateIcon from '$lib/runs/RunStateIcon.svelte';

  let { pull, approving, onApprove }: { pull: PullRequestDetail; approving: boolean; onApprove: () => void } = $props();
  const waiting = $derived(pull.checksApproval.waiting);
</script>

<section class="grid gap-3" aria-label="Checks">
  <p class="text-sm text-ink-muted">
    Checks for <code class="font-mono text-xs text-ink">{pull.sourceCommitId.slice(0, 7)}</code>. Required checks must
    pass on the latest commit.
  </p>
  {#if waiting}
    <div class="flex flex-wrap items-center gap-3 rounded-xl bg-warning-soft px-4 py-3 text-sm text-warning">
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
        <article class="grid grid-cols-[18px_minmax(0,1fr)_auto] items-center gap-3 px-4 py-3">
          <RunStateIcon state={check.state} />
          <div class="min-w-0">
            <strong class="block truncate text-sm font-semibold text-ink-strong">{check.name}</strong>
            {#if check.summary}<p class="mt-0.5 truncate text-xs text-ink-muted">{check.summary}</p>{/if}
          </div>
          {#if check.detailsUrl}<a
              class="inline-flex items-center gap-1 text-xs font-medium text-ink-muted hover:text-brand"
              href={check.detailsUrl}>Details<ExternalLink size={12} /></a
            >{:else}<span class="text-xs text-ink-muted capitalize">{check.state}</span>{/if}
        </article>
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
