<script lang="ts">
  import type { PullRevisionSummary, PullTimelineItem } from '@marl/contracts';
  import type { MarkdownContext } from '#lib/markdown/context.js';
  import PullActionComposer from '../review/PullActionComposer.svelte';
  import ReviewThread from '../review/ReviewThread.svelte';
  import type { PullPageState } from '../detail/pull-page-state.svelte';
  import PullCommentEntry from './PullCommentEntry.svelte';
  import PullRevision from './PullRevision.svelte';
  import PullRevisionActivity from './PullRevisionActivity.svelte';
  import { revisionParticipation, type DiscussionItem } from './revision-activity';

  let {
    pageState,
    viewerId,
    signedIn,
    context
  }: { pageState: PullPageState; viewerId?: string; signedIn: boolean; context: MarkdownContext } = $props();
  const pull = $derived(pageState.pull);
  const timeline = $derived(pageState.timeline);
  const repository = $derived(pull.sourceRepository ?? { owner: pageState.route.owner, name: pageState.route.repo });
  const currentRevision = $derived(timeline.revisions.find((revision) => revision.current));
  const previousRevisions = $derived(timeline.revisions.filter((revision) => !revision.current).toReversed());
  const currentParticipation = $derived(revisionParticipation(timeline.currentItems));

  function participation(revision: PullRevisionSummary) {
    return timeline.revisionLoaded(revision.sequence)
      ? revisionParticipation(timeline.revisionItems(revision.sequence))
      : revision;
  }
</script>

{#snippet entry(item: DiscussionItem, grouped: boolean)}
  {#if item.kind === 'thread'}
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

{#snippet activity(items: PullTimelineItem[], emptyMessage?: string)}
  <PullRevisionActivity
    {viewerId}
    canModerate={pull.canModerate}
    busy={pageState.busy}
    onDeleteReview={async (id) => void (await pageState.deleteReviewBody(id))}
    {items}
    labels={pull.availableLabels}
    {repository}
    {context}
    {entry}
    {emptyMessage}
  />
{/snippet}

<section class="grid gap-3" aria-label="Revisions">
  {#if currentRevision}
    <PullRevision
      revision={currentRevision}
      reviewers={currentParticipation.reviewers}
      unresolvedCount={currentParticipation.unresolvedCount}
      {repository}
      checks={{ summary: pull.checkSummary, href: pageState.tabHref('checks') }}
    >
      {@render composer()}
      {@render activity(timeline.currentItems, 'No review activity on this revision yet.')}
    </PullRevision>
  {:else}
    {@render composer()}
    {@render activity(timeline.currentItems)}
  {/if}
  {#each previousRevisions as revision (revision.sequence)}
    {@const { reviewers, unresolvedCount } = participation(revision)}
    <PullRevision
      {revision}
      {reviewers}
      {unresolvedCount}
      {repository}
      expanded={pageState.expandedRevisions.includes(revision.sequence)}
      loading={pageState.loadingRevisions.includes(revision.sequence)}
      onToggle={() => pageState.toggleRevision(revision)}
    >
      {@render activity(timeline.revisionItems(revision.sequence))}
    </PullRevision>
  {/each}
</section>
