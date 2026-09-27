<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { PullRequestReview } from '@marl/contracts';
  import type { MarkdownContext } from '$lib/markdown/context';
  import Button from '$lib/components/controls/Button.svelte';
  import Trash2 from '@lucide/svelte/icons/trash';
  import CircleCheck from '@lucide/svelte/icons/circle-check';
  import DiscussionEntry from '$lib/components/discussion/DiscussionEntry.svelte';
  import MarkdownBody from '$lib/components/markdown/MarkdownBody.svelte';
  import Time from '$lib/components/page/Time.svelte';
  import UserProfileLink from '$lib/components/identity/UserProfileLink.svelte';
  import type { ThreadItem } from './group-review-activity';

  let {
    review,
    threads,
    context,
    entry,
    viewerId,
    canModerate = false,
    busy = false,
    onDeleteReview
  }: {
    review: PullRequestReview;
    viewerId?: string;
    canModerate?: boolean;
    busy?: boolean;
    onDeleteReview?: (id: string) => Promise<void>;
    threads: ThreadItem[];
    context?: MarkdownContext;
    entry: Snippet<[ThreadItem, boolean]>;
  } = $props();

  let confirming = $state(false);
  const outcome = $derived(
    review.state === 'approved'
      ? 'approved this revision'
      : review.state === 'changes_requested'
        ? 'requested changes'
        : 'reviewed'
  );
</script>

{#if review.carriedFromReviewId}
  <article
    class="grid grid-cols-[16px_minmax(0,1fr)] items-start gap-2.5 px-3 py-2.5 text-sm leading-normal text-ink-muted"
  >
    <CircleCheck size={16} class="mt-0.5 text-success" />
    <p class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
      <span class="flex-1"
        ><UserProfileLink
          handle={review.author}
          displayName={review.authorDisplayName}
          avatar={false}
          class="text-sm"
        />’s approval was carried forward</span
      ><Time value={review.createdAt} />
    </p>
  </article>
{:else}
  <section class="min-w-0 surface rounded-2xl" aria-label={`${review.authorDisplayName} ${outcome}`}>
    <div class="p-3 [contain-intrinsic-size:auto_120px] [content-visibility:auto] sm:px-4 sm:pt-3.5 sm:pb-4">
      <DiscussionEntry
        author={review.author}
        displayName={review.authorDisplayName}
        avatarUrl={review.authorAvatarUrl}
        createdAt={review.createdAt}
        tone={review.state}
        {outcome}
        contained={false}
      >
        {#snippet actions()}
          {#if review.body && onDeleteReview && (review.authorId === viewerId || canModerate)}
            {#if confirming}
              <Button
                size="small"
                variant="danger-soft"
                disabled={busy}
                onclick={async () => {
                  await onDeleteReview?.(review.id);
                  confirming = false;
                }}>Delete comment</Button
              >
              <Button size="small" variant="ghost" onclick={() => (confirming = false)}>Cancel</Button>
            {:else}<Button
                size="small"
                icon
                variant="ghost"
                aria-label="Delete review comment"
                onclick={() => (confirming = true)}><Trash2 size={14} /></Button
              >{/if}
          {/if}
        {/snippet}
        {#snippet children()}
          {#if review.bodyHtml}<MarkdownBody html={review.bodyHtml} />{/if}
          {#if confirming}<p class="mt-2.5 text-sm text-ink-muted">
              The review decision and line conversations will stay.
            </p>{/if}
        {/snippet}
      </DiscussionEntry>
    </div>
    {#if threads.length}
      <div class="grid gap-2 px-2 pb-2">
        {#each threads as thread (thread.value.id)}
          {@render entry(thread, true)}
        {/each}
      </div>
    {/if}
  </section>
{/if}
