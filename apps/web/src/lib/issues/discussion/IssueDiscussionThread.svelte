<script lang="ts">
  import { tick } from 'svelte';
  import type { IssueComment } from '@marl/contracts';
  import Reply from '@lucide/svelte/icons/reply';
  import Button from '#lib/components/controls/Button.svelte';
  import MarkdownComposer from '#lib/components/markdown/MarkdownComposer.svelte';
  import type { MarkdownContext } from '#lib/markdown/context.js';
  import IssueDiscussionComment from './IssueDiscussionComment.svelte';
  import type { DiscussionComment, DiscussionThread } from './issue-discussion';

  let {
    thread,
    viewerId,
    context,
    canReply,
    canConclude,
    busy,
    comments,
    draftKey,
    onSave,
    onDelete,
    onReply,
    onConclude,
    onSource
  }: {
    thread: DiscussionThread;
    viewerId?: string;
    context: MarkdownContext;
    canReply: boolean;
    canConclude: boolean;
    busy: boolean;
    comments: Map<string, IssueComment>;
    draftKey?: string;
    onSave: (id: string, body: string) => Promise<boolean>;
    onDelete: (id: string) => Promise<boolean>;
    onReply: (body: string, replyToId: string) => Promise<boolean>;
    onConclude: (comment: IssueComment) => void;
    onSource: (commentId: string) => Promise<void>;
  } = $props();
  let replyTarget = $state<IssueComment | null>(null);
  let replyDrafts = $state<Record<string, string>>({});
  const replyBody = $derived(replyTarget ? (replyDrafts[replyTarget.id] ?? '') : '');
  let uploading = $state(false);
  let composer = $state<HTMLDivElement>();

  async function beginReply(comment: IssueComment, quote: string) {
    if (uploading) return;
    if (replyTarget?.id !== comment.id) {
      replyDrafts[comment.id] ??= '';
      replyTarget = comment;
      await tick();
    }
    if (quote) replyDrafts[comment.id] = `${replyBody}${replyBody.trim() ? '\n\n' : ''}${quote}`;
    await tick();
    composer?.scrollIntoView({ block: 'nearest', behavior: 'instant' });
    composer?.querySelector('textarea')?.focus({ preventScroll: true });
  }
  async function send() {
    if (!replyTarget || !replyBody.trim() || uploading) return;
    const id = replyTarget.id;
    if (await onReply(replyBody, id)) {
      replyDrafts[id] = '';
      await tick();
      replyTarget = null;
    }
  }
</script>

{#snippet comment(entry: DiscussionComment, nested: boolean)}
  <IssueDiscussionComment
    comment={entry.comment}
    {viewerId}
    sequence={entry.sequence}
    replyTarget={nested && entry.comment.replyToId ? comments.get(entry.comment.replyToId) : undefined}
    {nested}
    {context}
    {canReply}
    {canConclude}
    {busy}
    {draftKey}
    {onSave}
    {onDelete}
    {onConclude}
    {onSource}
    onReply={beginReply}
  />
{/snippet}

<article
  class="min-w-0 surface [contain-intrinsic-size:auto_140px] [content-visibility:auto]"
  aria-label={`Conversation started by ${thread.root.comment.authorDisplayName}`}
>
  <div class="px-3.5 pt-3 pb-3.5 sm:px-4">{@render comment(thread.root, false)}</div>
  {#if thread.replies.length || replyTarget || canReply}<div class="grid gap-1 px-1.5 pb-1.5 sm:pl-12">
      {#each thread.replies as reply (reply.comment.id)}<div class="min-w-0 rounded-lg bg-surface-muted px-3 pt-2 pb-3">
          {@render comment(reply, true)}
        </div>{/each}
      {#if replyTarget && canReply}<div class="min-w-0 rounded-lg bg-surface-muted p-2" bind:this={composer}>
          <header class="mb-2 flex min-h-8 items-center justify-between gap-2.5 pl-1 text-sm text-ink-muted">
            <span class="truncate">Reply to {replyTarget.authorDisplayName}</span><Button
              size="small"
              variant="ghost"
              disabled={uploading}
              onclick={() => (replyTarget = null)}>Cancel</Button
            >
          </header>
          {#key replyTarget.id}<MarkdownComposer
              bind:value={replyDrafts[replyTarget.id]}
              bind:uploading
              {context}
              disabled={busy || !canReply}
              compact
              minHeight={100}
              placeholder="Write a reply"
              draftKey={draftKey ? `${draftKey}:reply:${replyTarget.id}` : undefined}
              onsubmit={send}
            />{/key}
          <footer class="mt-2 flex justify-end">
            <Button
              size="small"
              variant="primary"
              loading={busy}
              disabled={uploading || !replyBody.trim()}
              onclick={send}>Reply</Button
            >
          </footer>
        </div>
      {:else if canReply}<button
          type="button"
          class="flex h-9 items-center gap-2 rounded-lg px-3 text-left text-sm text-ink-faint transition-colors hover:bg-surface-muted hover:text-ink-muted"
          onclick={() => beginReply(thread.root.comment, '')}><Reply size={14} />Reply to this conversation</button
        >{/if}
    </div>{/if}
</article>
