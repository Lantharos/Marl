<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { PullTimelineItem, WorkItemLabel } from '@marl/contracts';
  import type { MarkdownContext } from '#lib/markdown/context.js';
  import PullReviewGroup from '../review/PullReviewGroup.svelte';
  import PullActivityNotes from './PullActivityNotes.svelte';
  import { activityKey, groupRevisionActivity, type DiscussionItem } from './revision-activity';

  let {
    items,
    labels,
    repository,
    context,
    entry,
    viewerId,
    canModerate = false,
    busy = false,
    onDeleteReview,
    emptyMessage = 'No discussion on this revision.'
  }: {
    items: PullTimelineItem[];
    labels: WorkItemLabel[];
    repository: { owner: string; name: string };
    viewerId?: string;
    canModerate?: boolean;
    busy?: boolean;
    onDeleteReview?: (id: string) => Promise<void>;
    context?: MarkdownContext;
    entry: Snippet<[DiscussionItem, boolean]>;
    emptyMessage?: string;
  } = $props();

  const activity = $derived(groupRevisionActivity(items));
</script>

{#each activity as item (activityKey(item))}
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
  {:else if item.kind === 'notes'}
    <PullActivityNotes notes={item.notes} {labels} {repository} />
  {:else}
    {@render entry(item, false)}
  {/if}
{:else}
  <p class="px-3 py-3 text-sm text-ink-muted">{emptyMessage}</p>
{/each}
