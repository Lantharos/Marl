<script lang="ts">
  import type { PullTimelineItem } from '@marl/contracts';
  import type { MarkdownContext } from '#lib/markdown/context.js';
  import type { PullPageState } from '#lib/pulls/detail/pull-page-state.svelte.js';
  import PullActivityNotes from '#lib/pulls/overview/PullActivityNotes.svelte';
  import PullCommentEntry from '#lib/pulls/overview/PullCommentEntry.svelte';
  import { activityKey, groupRevisionActivity, type DiscussionItem } from '#lib/pulls/overview/revision-activity.js';
  import PullReviewGroup from '#lib/pulls/review/PullReviewGroup.svelte';
  import ReviewThread from '#lib/pulls/review/ReviewThread.svelte';

  let {
    pageState,
    items,
    viewerId,
    context,
    chronological = false,
    empty = 'Nothing has been said on this revision yet.'
  }: {
    pageState: PullPageState;
    items: PullTimelineItem[];
    viewerId: string;
    context: MarkdownContext;
    chronological?: boolean;
    empty?: string;
  } = $props();
  const pull = $derived(pageState.pull);
  const grouped = $derived(groupRevisionActivity(items));
  const activity = $derived(chronological ? grouped.toReversed() : grouped);
  const repository = $derived(pull.sourceRepository ?? { owner: pageState.route.owner, name: pageState.route.repo });
</script>

{#snippet entry(item: DiscussionItem, grouped: boolean)}
  {#if item.kind === 'thread'}
    <ReviewThread
      thread={item.value}
      state={pageState.timeline.threadState(item.value.id)}
      busy={pageState.busy}
      {grouped}
      interactive={pull.canManage && !pull.locked}
      canResolve={pull.canModerate}
      canModerate={pull.canModerate}
      {viewerId}
      {context}
      onLoadContext={pageState.loadThreadContext}
      onReply={pageState.reply}
      onResolve={pageState.setThreadResolved}
      onEdit={pageState.saveReviewComment}
      onDelete={pageState.deleteReviewComment}
    />
  {:else}
    <PullCommentEntry
      comment={item.value}
      {context}
      busy={pageState.busy}
      {viewerId}
      canModerate={pull.canModerate}
      onSave={pageState.savePullComment}
      onDelete={pageState.deletePullComment}
    />
  {/if}
{/snippet}

{#each activity as item (activityKey(item))}
  {#if item.kind === 'review'}
    <PullReviewGroup
      review={item.value}
      threads={item.threads}
      {context}
      {entry}
      {viewerId}
      canModerate={pull.canModerate}
      busy={pageState.busy}
      onDeleteReview={async (id) => void (await pageState.deleteReviewBody(id))}
    />
  {:else if item.kind === 'notes'}
    <PullActivityNotes notes={item.notes} labels={pull.availableLabels} {repository} />
  {:else}
    {@render entry(item, false)}
  {/if}
{:else}
  <p class="px-3 py-3 text-sm text-ink-muted">{empty}</p>
{/each}
