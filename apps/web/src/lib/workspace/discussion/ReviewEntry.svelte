<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { PullRequestReview } from '@marl/contracts';
  import type { ThreadItem } from '#lib/pulls/overview/revision-activity.js';
  import type { Discussion } from './discussion.svelte';
  import Message from './Message.svelte';

  let {
    discussion,
    review,
    threads,
    thread
  }: {
    discussion: Discussion;
    review: PullRequestReview;
    threads: ThreadItem[];
    thread: Snippet<[ThreadItem]>;
  } = $props();
  const verdicts = {
    approved: { label: 'approved', tone: 'text-success' },
    changes_requested: { label: 'requested changes', tone: 'text-warning' },
    commented: { label: 'reviewed', tone: 'text-ink-muted' }
  };
  const outcome = $derived(verdicts[review.state]);
  const actions = $derived(
    review.bodyHtml && (review.authorId === discussion.viewerId || discussion.pull.canModerate)
      ? [
          {
            label: 'Delete summary',
            danger: true,
            onSelect: () =>
              (discussion.removal = {
                title: 'Delete this review summary?',
                message: 'The decision and its line conversations stay.',
                remove: () => discussion.pageState.deleteReviewBody(review.id)
              })
          }
        ]
      : []
  );
</script>

<div class="grid gap-3">
  <Message
    author={{
      handle: review.author,
      displayName: review.authorDisplayName,
      avatarUrl: review.authorAvatarUrl,
      kind: review.authorKind
    }}
    createdAt={review.createdAt}
    body={review.body}
    bodyHtml={review.bodyHtml}
    context={discussion.context}
    {actions}
  >
    {#snippet verdict()}<span class={['shrink-0 text-sm font-medium', outcome.tone]}>{outcome.label}</span>{/snippet}
  </Message>
  {#if threads.length}<div class="grid gap-2 pl-10">
      {#each threads as item (item.value.id)}{@render thread(item)}{/each}
    </div>{/if}
</div>
