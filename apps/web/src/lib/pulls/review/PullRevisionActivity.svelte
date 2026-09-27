<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { PullTimelineItem } from '@marl/contracts';
  import type { MarkdownContext } from '$lib/markdown/context';
  import PullReviewGroup from './PullReviewGroup.svelte';
  import { groupReviewActivity, type DiscussionItem } from './group-review-activity';

  let {
    items,
    context,
    entry,
    viewerId,
    canModerate = false,
    busy = false,
    onDeleteReview,
    emptyMessage = 'No discussion on this revision.'
  }: {
    items: PullTimelineItem[];
    viewerId?: string;
    canModerate?: boolean;
    busy?: boolean;
    onDeleteReview?: (id: string) => Promise<void>;
    context?: MarkdownContext;
    entry: Snippet<[DiscussionItem, boolean]>;
    emptyMessage?: string;
  } = $props();

  const activity = $derived(groupReviewActivity(items));
</script>

{#each activity as item (`${item.kind}:${item.value.id}`)}
  {#if item.kind === 'review'}
    <PullReviewGroup
      review={item.value}
      threads={item.threads}
      {context}
      {entry}
      {viewerId}
      {canModerate}
      {busy}
      {onDeleteReview}
    />
  {:else}
    {@render entry(item, false)}
  {/if}
{:else}
  <p class="px-2.5 py-4 text-sm text-ink-muted">{emptyMessage}</p>
{/each}
