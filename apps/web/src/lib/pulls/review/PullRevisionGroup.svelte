<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { PullRevisionSummary } from '@marl/contracts';
  import ChevronDown from '@lucide/svelte/icons/chevron-down';
  import Spinner from '$lib/components/feedback/Spinner.svelte';
  import Time from '$lib/components/page/Time.svelte';
  import UserProfileLink from '$lib/components/identity/UserProfileLink.svelte';

  let {
    revision,
    expanded = false,
    loading = false,
    onToggle,
    children
  }: {
    revision: PullRevisionSummary;
    expanded?: boolean;
    loading?: boolean;
    onToggle?: () => void;
    children: Snippet;
  } = $props();

  const reviewLabel = $derived(
    revision.reviewState === 'changes_requested'
      ? 'Changes requested'
      : revision.reviewState === 'approved'
        ? 'Approved'
        : revision.reviewState === 'commented'
          ? 'Reviewed'
          : 'Not reviewed'
  );
</script>

{#snippet heading()}
  <span class="grid min-w-0 flex-1 gap-1.5">
    <span class="flex flex-wrap items-center gap-2.5">
      <strong class="text-sm font-semibold text-ink-strong">Revision {revision.number}</strong>
      {#if revision.current}<span class="rounded-full bg-brand-soft px-2 py-0.5 text-2xs font-semibold text-brand"
          >Current</span
        >{/if}
      <code class="font-mono text-xs text-ink-faint">{revision.commitId.slice(0, 7)}</code>
    </span>
    <span class="truncate text-sm text-ink-strong" title={revision.title}>{revision.title}</span>
    <span class="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-xs text-ink-muted">
      {#if revision.current}<UserProfileLink
          handle={revision.actor}
          displayName={revision.actorDisplayName || revision.actor}
          avatar={false}
          class="text-xs"
        />{:else}<span>{revision.actorDisplayName || revision.actor}</span>{/if}<Time value={revision.createdAt} />
      <span>{revision.commitCount} {revision.commitCount === 1 ? 'commit' : 'commits'}</span>
      {#if revision.forcePushed}<span class="text-warning">Force-pushed</span>{/if}
      {#if !revision.current}<span>{reviewLabel}</span>{#if revision.conversationCount}<span
            >{revision.conversationCount} {revision.conversationCount === 1 ? 'conversation' : 'conversations'}</span
          >{/if}{/if}
    </span>
  </span>
{/snippet}

<section class="min-w-0 rounded-2xl bg-surface-muted/60">
  {#if revision.current}
    <header class="px-4 py-3.5">{@render heading()}</header>
  {:else}
    <button
      type="button"
      aria-expanded={expanded}
      onclick={onToggle}
      class="flex w-full items-center gap-4 rounded-2xl px-4 py-3.5 text-left transition-colors hover:bg-surface-hover"
    >
      {@render heading()}<ChevronDown size={17} class="shrink-0 text-ink-muted" />
    </button>
  {/if}
  {#if revision.current || expanded}
    <div class="grid gap-2.5 px-2 pb-2 sm:px-2.5 sm:pb-2.5" aria-busy={loading}>
      {#if loading}<div class="flex items-center gap-2 px-2.5 py-4 text-sm text-ink-muted" role="status">
          <Spinner />Loading discussion
        </div>{:else}{@render children()}{/if}
    </div>
  {/if}
</section>
