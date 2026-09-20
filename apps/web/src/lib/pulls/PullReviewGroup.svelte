<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { PullRequestReview } from '@marl/contracts';
  import type { MarkdownContext } from '$lib/markdown';
  import Button from '$lib/components/Button.svelte';
  import Trash2 from 'lucide-svelte/icons/trash-2';
  import CircleCheck from 'lucide-svelte/icons/circle-check';
  import DiscussionEntry from '$lib/components/DiscussionEntry.svelte';
  import MarkdownBody from '$lib/components/MarkdownBody.svelte';
  import Time from '$lib/components/Time.svelte';
  import UserProfileLink from '$lib/components/UserProfileLink.svelte';
  import type { ThreadItem } from './group-review-activity';

  let { review, threads, context, entry, viewerId, canModerate = false, busy = false, onDeleteReview } = $props<{
    review: PullRequestReview;
    viewerId?: string;
    canModerate?: boolean;
    busy?: boolean;
    onDeleteReview?: (id: string) => Promise<void>;
    threads: ThreadItem[];
    context?: MarkdownContext;
    entry: Snippet<[ThreadItem, boolean]>;
  }>();

  let confirming = $state(false);
  const outcome = $derived(review.state === 'approved' ? 'approved this revision' : review.state === 'changes_requested' ? 'requested changes' : 'reviewed');
</script>

{#if review.carriedFromReviewId}
  <article class="carried-approval">
    <CircleCheck size={15} />
    <p><span><UserProfileLink handle={review.author} displayName={review.authorDisplayName} avatar={false} />’s approval was carried forward</span><Time value={review.createdAt} /></p>
  </article>
{:else}
<section class="review-group" aria-label={`${review.authorDisplayName} ${outcome}`}>
  <div class="review-summary">
    <DiscussionEntry author={review.author} displayName={review.authorDisplayName} avatarUrl={review.authorAvatarUrl} createdAt={review.createdAt} tone={review.state} {outcome} contained={false}>
      {#snippet actions()}
        {#if review.body && onDeleteReview && (review.authorId === viewerId || canModerate)}
          {#if confirming}<Button size="small" variant="danger-soft" disabled={busy} onclick={async () => { await onDeleteReview?.(review.id); confirming = false; }}>Delete comment</Button><Button size="small" variant="ghost" onclick={() => (confirming = false)}>Cancel</Button>{:else}<Button size="small" icon variant="ghost" aria-label="Delete review comment" onclick={() => (confirming = true)}><Trash2 size={14} /></Button>{/if}
        {/if}
      {/snippet}
      {#snippet children()}
        {#if review.body}<MarkdownBody source={review.body} {context} />{/if}
        {#if confirming}<p class="delete-note">The review decision and line conversations will stay.</p>{/if}
      {/snippet}
    </DiscussionEntry>
  </div>
  {#if threads.length}
    <div class="review-threads">
      {#each threads as thread (thread.value.id)}
        {@render entry(thread, true)}
      {/each}
    </div>
  {/if}
</section>
{/if}

<style>
  .carried-approval{display:grid;grid-template-columns:15px minmax(0,1fr);align-items:start;gap:9px;padding:10px 12px;color:var(--text-muted);font-size:12px;line-height:1.5}.carried-approval>:global(svg){margin-top:2px;color:var(--success)}.carried-approval p{display:flex;flex-wrap:wrap;align-items:baseline;gap:4px 12px;margin:0}.carried-approval p>span{flex:1}.carried-approval :global(.user-profile-link){font-size:12px}.carried-approval :global(time){font-size:11px}
  .delete-note{margin:10px 0 0;color:var(--text-muted);font-size:12px}
  .review-group{min-width:0;border-radius:15px;background:var(--surface);box-shadow:var(--shadow-surface)}
  .review-summary{padding:14px 16px 16px;content-visibility:auto;contain-intrinsic-size:auto 120px}
  .review-threads{display:grid;gap:8px;padding:0 8px 8px}
  @media(max-width:600px){.review-summary{padding:12px}}
</style>
