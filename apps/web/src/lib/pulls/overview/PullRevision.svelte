<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { PullRequestSummary, PullRevisionReviewer, PullRevisionSummary } from '@marl/contracts';
  import ChevronDown from '@lucide/svelte/icons/chevron-down';
  import CircleCheck from '@lucide/svelte/icons/circle-check';
  import CircleX from '@lucide/svelte/icons/circle-x';
  import LoaderCircle from '@lucide/svelte/icons/loader-circle';
  import MessageSquare from '@lucide/svelte/icons/message-square';
  import Spinner from '#lib/components/feedback/Spinner.svelte';
  import Time from '#lib/components/page/Time.svelte';
  import RevisionCommits from './RevisionCommits.svelte';
  import RevisionReviewers from './RevisionReviewers.svelte';

  let {
    revision,
    reviewers,
    unresolvedCount,
    repository,
    checks,
    expanded = false,
    loading = false,
    onToggle,
    children
  }: {
    revision: PullRevisionSummary;
    reviewers: PullRevisionReviewer[];
    unresolvedCount: number;
    repository: { owner: string; name: string };
    checks?: { summary: PullRequestSummary['checkSummary']; href: string };
    expanded?: boolean;
    loading?: boolean;
    onToggle?: () => void;
    children: Snippet;
  } = $props();

  const outcomes = {
    approved: { label: 'Approved', tone: 'font-medium text-success' },
    changes_requested: { label: 'Changes requested', tone: 'font-medium text-warning' },
    commented: { label: 'Reviewed', tone: 'text-ink-muted' }
  };
  const open = $derived(revision.current || expanded);
  const headingId = $props.id();
  const checkOutcome = $derived.by(() => {
    if (!checks?.summary.total) return null;
    const { total, passed, failed, running } = checks.summary;
    if (failed) return { icon: CircleX, tone: 'text-danger', label: `${failed} of ${total} checks failed` };
    if (running) return { icon: LoaderCircle, tone: 'text-brand', label: `${running} of ${total} checks running` };
    return { icon: CircleCheck, tone: 'text-success', label: `${passed} of ${total} checks passed` };
  });
</script>

<section class="min-w-0 rounded-2xl bg-surface-muted/60" aria-labelledby={headingId}>
  <header
    class={[
      'relative flex items-start gap-4 rounded-2xl px-4 py-3.5',
      !revision.current && 'transition-colors has-[button:hover]:bg-surface-hover'
    ]}
  >
    <div class="grid min-w-0 flex-1 gap-1">
      <h2 id={headingId} class="flex items-baseline gap-2 text-sm">
        {#if revision.current}<strong class="font-semibold text-ink-strong">Revision {revision.number}</strong><span
            class="text-xs font-medium text-brand">Current</span
          >{:else}<button
            type="button"
            class="font-semibold text-ink-strong after:absolute after:inset-0 after:rounded-2xl focus-visible:outline-none after:focus-visible:outline-2 after:focus-visible:outline-brand"
            aria-expanded={expanded}
            onclick={onToggle}>Revision {revision.number}</button
          >{/if}
      </h2>
      <p class="truncate text-sm text-ink">{revision.title}</p>
      <p class="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-muted">
        <code class="font-mono text-ink-faint">{revision.commitId.slice(0, 7)}</code>
        <span>{revision.actorDisplayName || revision.actor} pushed <Time value={revision.createdAt} /></span>
        <span>{revision.commits.length} {revision.commits.length === 1 ? 'commit' : 'commits'}</span>
        {#if !revision.current && revision.reviewState !== 'none'}<span class={outcomes[revision.reviewState].tone}
            >{outcomes[revision.reviewState].label}</span
          >{/if}
        {#if checkOutcome && checks}<a
            href={checks.href}
            class={['relative z-1 inline-flex items-center gap-1 hover:underline', checkOutcome.tone]}
            ><checkOutcome.icon size={13} aria-hidden="true" />{checkOutcome.label}</a
          >{/if}
        {#if revision.conversationCount}<span class="inline-flex items-center gap-1"
            ><MessageSquare size={13} aria-hidden="true" />{revision.conversationCount}
            {revision.conversationCount === 1 ? 'conversation' : 'conversations'}</span
          >{/if}
        {#if unresolvedCount}<span class="font-medium text-warning">{unresolvedCount} unresolved</span>{/if}
        {#if revision.forcePushed}<span class="text-warning">Force-pushed</span>{/if}
      </p>
    </div>
    {#if reviewers.length}<div class="relative z-1 pt-0.5"><RevisionReviewers {reviewers} /></div>{/if}
    {#if !revision.current}<ChevronDown
        size={17}
        class={['mt-0.5 shrink-0 text-ink-muted transition-transform', expanded && 'rotate-180']}
        aria-hidden="true"
      />{/if}
  </header>
  {#if open}
    <div class="grid gap-2.5 px-2 pb-2 sm:px-2.5 sm:pb-2.5" aria-busy={loading}>
      {#if revision.commits.length > 1}<div class="-mt-1.5 px-1.5">
          <RevisionCommits commits={revision.commits} {repository} />
        </div>{/if}
      {#if loading}<div class="flex items-center gap-2 px-2.5 py-4 text-sm text-ink-muted" role="status">
          <Spinner />Loading discussion
        </div>{:else}{@render children()}{/if}
    </div>
  {/if}
</section>
