<script lang="ts">
  import { tick } from 'svelte';
  import type { IssueComment } from '@marl/contracts';
  import Button from '$lib/components/controls/Button.svelte';
  import MarkdownComposer from '$lib/components/markdown/MarkdownComposer.svelte';
  import type { MarkdownContext } from '$lib/markdown/context';
  import IssueDiscussionComment from './IssueDiscussionComment.svelte';
  import type { DiscussionThread } from './issue-discussion';

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

<article
  class="min-w-0 surface [contain-intrinsic-size:auto_160px] [content-visibility:auto]"
  aria-label={`Conversation started by ${thread.root.comment.authorDisplayName}`}
>
  <div class="p-4 sm:px-5 sm:py-4.5">
    <IssueDiscussionComment
      comment={thread.root.comment}
      {viewerId}
      sequence={thread.root.sequence}
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
  </div>
  {#if thread.replies.length}<div class="grid gap-2 pr-2 pb-2 pl-5 sm:pr-3 sm:pb-3 sm:pl-12">
      {#each thread.replies as reply (reply.comment.id)}<div class="min-w-0 rounded-lg bg-surface-muted p-3.5 sm:p-4">
          <IssueDiscussionComment
            comment={reply.comment}
            {viewerId}
            sequence={reply.sequence}
            replyTarget={reply.comment.replyToId ? comments.get(reply.comment.replyToId) : undefined}
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
        </div>{/each}
    </div>{/if}
  {#if replyTarget && canReply}<div class="pr-3 pb-3.5 pl-5 sm:pr-5 sm:pb-4.5 sm:pl-12" bind:this={composer}>
      <header class="mt-0.5 mb-2 flex items-center justify-between gap-2.5 text-sm text-ink-muted">
        <span>Reply to {replyTarget.authorDisplayName}</span><Button
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
        <Button size="small" variant="primary" loading={busy} disabled={uploading || !replyBody.trim()} onclick={send}
          >Reply</Button
        >
      </footer>
    </div>{/if}
</article>
