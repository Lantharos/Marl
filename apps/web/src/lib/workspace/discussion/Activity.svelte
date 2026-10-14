<script lang="ts">
  import type { PullTimelineItem, ReviewThread } from '@marl/contracts';
  import PullActivityNotes from '#lib/pulls/overview/PullActivityNotes.svelte';
  import { activityKey, groupRevisionActivity, type ThreadItem } from '#lib/pulls/overview/revision-activity.js';
  import type { Discussion } from './discussion.svelte';
  import Message from './Message.svelte';
  import ReviewEntry from './ReviewEntry.svelte';
  import Thread from './Thread.svelte';
  import ThreadLink from './ThreadLink.svelte';

  let {
    discussion,
    items,
    onShowThread
  }: {
    discussion: Discussion;
    items: PullTimelineItem[];
    onShowThread?: (thread: ReviewThread) => void;
  } = $props();
  const activity = $derived(groupRevisionActivity(items).toReversed());
  const repository = $derived(
    discussion.pull.sourceRepository ?? {
      owner: discussion.pageState.route.owner,
      name: discussion.pageState.route.repo
    }
  );
</script>

{#snippet thread(item: ThreadItem)}
  {#if onShowThread}<ThreadLink thread={item.value} onShow={onShowThread} />{:else}<Thread
      {discussion}
      thread={item.value}
    />{/if}
{/snippet}

<div class="grid gap-6">
  {#each activity as item (activityKey(item))}
    {#if item.kind === 'review'}
      <ReviewEntry {discussion} review={item.value} threads={item.threads} {thread} />
    {:else if item.kind === 'notes'}
      <PullActivityNotes notes={item.notes} labels={discussion.pull.availableLabels} {repository} />
    {:else if item.kind === 'thread'}
      {@render thread(item)}
    {:else}
      <Message
        author={{
          handle: item.value.author,
          displayName: item.value.authorDisplayName,
          avatarUrl: item.value.authorAvatarUrl,
          kind: item.value.authorKind
        }}
        createdAt={item.value.createdAt}
        edited={item.value.updatedAt !== item.value.createdAt}
        deleted={item.value.deleted}
        body={item.value.body}
        bodyHtml={item.value.bodyHtml}
        context={discussion.context}
        busy={discussion.pageState.busy}
        actions={discussion.commentActions(item.value)}
        bind:editing={
          () => discussion.editing === item.value.id, (value) => (discussion.editing = value ? item.value.id : null)
        }
        onSave={discussion.saveComment(item.value.id)}
      />
    {/if}
  {:else}
    <p class="text-sm text-ink-faint">Nothing has been said on this revision yet.</p>
  {/each}
</div>
