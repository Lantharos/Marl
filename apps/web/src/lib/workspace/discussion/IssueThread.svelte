<script lang="ts">
  import type { IssueComment } from '@marl/contracts';
  import Reply from '@lucide/svelte/icons/reply';
  import Button from '#lib/components/controls/Button.svelte';
  import MarkdownComposer from '#lib/components/markdown/MarkdownComposer.svelte';
  import type { DiscussionComment, DiscussionThread } from '#lib/issues/discussion/issue-discussion.js';
  import type { IssuePageState } from '#lib/issues/discussion/issue-page-state.svelte.js';
  import type { MarkdownContext } from '#lib/markdown/context.js';
  import { reporting } from '#lib/reporting/reporting.svelte.js';
  import Message from './Message.svelte';

  let {
    thread,
    pageState,
    viewerId,
    context,
    canReply,
    comments,
    draftKey,
    onSource,
    onRemove
  }: {
    thread: DiscussionThread;
    pageState: IssuePageState;
    viewerId: string;
    context: MarkdownContext;
    canReply: boolean;
    comments: Map<string, IssueComment>;
    draftKey: string;
    onSource: (commentId: string) => Promise<void>;
    onRemove: (comment: IssueComment) => void;
  } = $props();
  let editing = $state<string | null>(null);
  let replying = $state(false);
  let reply = $state('');
  let uploading = $state(false);

  function actions(comment: IssueComment) {
    if (comment.deleted) return [];
    const own = comment.authorId === viewerId;
    return [
      ...(comment.canEdit
        ? [
            { label: 'Edit', onSelect: () => (editing = comment.id) },
            { label: 'Delete', danger: true, onSelect: () => onRemove(comment) }
          ]
        : []),
      ...(own
        ? []
        : [
            {
              label: 'Report',
              onSelect: () => reporting.open({ type: 'issue_comment', id: comment.id, label: 'comment' })
            }
          ])
    ];
  }

  async function send() {
    if (uploading || !reply.trim()) return;
    if (await pageState.addComment(reply, thread.root.comment.id)) {
      reply = '';
      replying = false;
    }
  }
</script>

{#snippet message({ comment, sequence }: DiscussionComment, size: 'regular' | 'small')}
  {@const target = comment.replyToId && comment.replyToId !== comment.parentId ? comments.get(comment.replyToId) : null}
  <div id="comment-{comment.id}" class="scroll-my-24">
    <Message
      author={{
        handle: comment.author,
        displayName: comment.authorDisplayName,
        avatarUrl: comment.authorAvatarUrl,
        kind: comment.authorKind
      }}
      createdAt={comment.createdAt}
      edited={comment.updatedAt !== comment.createdAt}
      deleted={comment.deleted}
      body={comment.body}
      bodyHtml={comment.bodyHtml}
      {context}
      busy={pageState.busy}
      {size}
      actions={actions(comment)}
      bind:editing={() => editing === comment.id, (value) => (editing = value ? comment.id : null)}
      onSave={(body) => pageState.saveComment(comment.id, body)}
    >
      {#snippet verdict()}{#if target}<a
            href="#comment-{target.id}"
            class="flex min-w-0 items-center gap-1 text-xs text-ink-muted hover:text-brand"
            onclick={(event) => {
              event.preventDefault();
              void onSource(target.id);
            }}><Reply size={12} class="shrink-0" /><span class="truncate">{target.authorDisplayName}</span></a
          >{/if}{/snippet}
    </Message>
    {#if sequence !== undefined}<span class="block h-px" data-read-sequence={sequence} aria-hidden="true"></span>{/if}
  </div>
{/snippet}

<article
  class="grid min-w-0 gap-4 [contain-intrinsic-size:auto_120px] [content-visibility:auto]"
  aria-label="Conversation started by {thread.root.comment.authorDisplayName}"
>
  {@render message(thread.root, 'regular')}
  {#if thread.replies.length || canReply}<div class="grid gap-4 pl-10">
      {#each thread.replies as entry (entry.comment.id)}{@render message(entry, 'small')}{/each}
      {#if canReply}
        {#if replying || reply}<MarkdownComposer
            bind:value={reply}
            bind:uploading
            variant="inline"
            minHeight="44px"
            placeholder="Reply"
            draftKey="{draftKey}:reply:{thread.id}"
            {context}
            disabled={pageState.busy}
            onsubmit={send}
          >
            {#snippet actions()}
              <Button size="small" variant="ghost" onclick={() => ((replying = false), (reply = ''))}>Cancel</Button>
              <Button
                size="small"
                variant="primary"
                loading={pageState.busy}
                disabled={!reply.trim() || uploading}
                onclick={send}>Reply</Button
              >
            {/snippet}
          </MarkdownComposer>{:else}<button
            type="button"
            class="-ml-2.5 flex h-8 w-fit items-center rounded-lg px-2.5 text-left text-sm text-ink-faint transition-colors hover:bg-surface-hover hover:text-ink-muted"
            onclick={() => (replying = true)}>Reply…</button
          >{/if}
      {/if}
    </div>{/if}
</article>
