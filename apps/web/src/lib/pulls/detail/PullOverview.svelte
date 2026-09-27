<script lang="ts">
  import ReferenceTimelineEvent from '$lib/components/discussion/ReferenceTimelineEvent.svelte';
  import type { MarkdownContext } from '$lib/markdown/context';
  import PullTimelineEvent from '../PullTimelineEvent.svelte';
  import type { DiscussionItem } from '../review/group-review-activity';
  import PullActionComposer from '../review/PullActionComposer.svelte';
  import PullRevisionActivity from '../review/PullRevisionActivity.svelte';
  import PullRevisionGroup from '../review/PullRevisionGroup.svelte';
  import ReviewThread from '../review/ReviewThread.svelte';
  import PullCommentEntry from './PullCommentEntry.svelte';
  import type { PullPageState } from './pull-page-state.svelte';

  let {
    pageState,
    viewerId,
    signedIn,
    context
  }: { pageState: PullPageState; viewerId?: string; signedIn: boolean; context: MarkdownContext } = $props();
  const pull = $derived(pageState.pull);
  const timeline = $derived(pageState.timeline);
  const currentRevision = $derived(timeline.revisions.find((revision) => revision.current));
  const previousRevisions = $derived(timeline.revisions.filter((revision) => !revision.current).toReversed());
</script>

{#snippet entry(item: DiscussionItem, grouped: boolean)}
  {#if item.kind === 'event'}
    <PullTimelineEvent
      event={item.value}
      repository={pull.sourceRepository ?? { owner: pageState.route.owner, name: pageState.route.repo }}
    />
  {:else if item.kind === 'reference'}
    <ReferenceTimelineEvent reference={item.value} />
  {:else if item.kind === 'thread'}
    <ReviewThread
      thread={item.value}
      state={timeline.threadState(item.value.id)}
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

{#snippet composer()}
  {#if signedIn}<PullActionComposer
      bind:value={pageState.commentBody}
      {context}
      pullState={pull.state}
      locked={pull.locked}
      busy={pageState.busy}
      canManage={pull.canManage}
      onComment={pageState.addComment}
      onAction={pageState.act}
    />{/if}
{/snippet}

{#snippet activity(items: typeof timeline.currentItems, emptyMessage?: string)}
  <PullRevisionActivity
    {viewerId}
    canModerate={pull.canModerate}
    busy={pageState.busy}
    onDeleteReview={async (id) => void (await pageState.deleteReviewBody(id))}
    {items}
    {context}
    {entry}
    {emptyMessage}
  />
{/snippet}

<section class="grid gap-3" aria-label="Review activity">
  {#if currentRevision}
    <PullRevisionGroup revision={currentRevision}>
      {@render composer()}
      {@render activity(timeline.currentItems, 'No review activity on this revision yet.')}
    </PullRevisionGroup>
  {:else}
    {@render composer()}
    {@render activity(timeline.currentItems)}
  {/if}
  {#each previousRevisions as revision (revision.sequence)}
    <PullRevisionGroup
      {revision}
      expanded={pageState.expandedRevisions.includes(revision.sequence)}
      loading={pageState.loadingRevisions.includes(revision.sequence)}
      onToggle={() => pageState.toggleRevision(revision)}
    >
      {@render activity(timeline.revisionItems(revision.sequence))}
    </PullRevisionGroup>
  {/each}
</section>
