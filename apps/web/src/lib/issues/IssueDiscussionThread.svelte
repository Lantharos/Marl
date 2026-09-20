<script lang="ts">
  import { tick } from 'svelte';
  import type { IssueComment } from '@marl/contracts';
  import Button from '$lib/components/Button.svelte';
  import MarkdownComposer from '$lib/components/MarkdownComposer.svelte';
  import type { MarkdownContext } from '$lib/markdown';
  import IssueDiscussionComment from './IssueDiscussionComment.svelte';
  import type { DiscussionThread } from './issue-discussion';

  let { thread, context, canReply, canConclude, busy, comments, draftKey, onSave, onDelete, onReply, onConclude, onSource } = $props<{
    thread: DiscussionThread;
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
  }>();
  let replyTarget = $state<IssueComment | null>(null);
  let replyDrafts = $state<Record<string, string>>({});
  const replyBody = $derived(replyTarget ? replyDrafts[replyTarget.id] ?? '' : '');
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

<article class="thread" aria-label={`Conversation started by ${thread.root.comment.authorDisplayName}`}>
  <div class="root"><IssueDiscussionComment comment={thread.root.comment} sequence={thread.root.sequence} {context} {canReply} {canConclude} {busy} {draftKey} {onSave} {onDelete} {onConclude} {onSource} onReply={beginReply} /></div>
  {#if thread.replies.length}<div class="replies">
    {#each thread.replies as reply (reply.comment.id)}<div class="reply"><IssueDiscussionComment comment={reply.comment} sequence={reply.sequence} replyTarget={reply.comment.replyToId ? comments.get(reply.comment.replyToId) : undefined} {context} {canReply} {canConclude} {busy} {draftKey} {onSave} {onDelete} {onConclude} {onSource} onReply={beginReply} /></div>{/each}
  </div>{/if}
  {#if replyTarget && canReply}<div class="reply-composer" bind:this={composer}>
    <header><span>Reply to {replyTarget.authorDisplayName}</span><Button size="small" variant="ghost" disabled={uploading} onclick={() => (replyTarget = null)}>Cancel</Button></header>
    {#key replyTarget.id}<MarkdownComposer bind:value={replyDrafts[replyTarget.id]} bind:uploading {context} disabled={busy || !canReply} compact minHeight={100} placeholder="Write a reply" draftKey={draftKey ? `${draftKey}:reply:${replyTarget.id}` : undefined} />{/key}
    <footer><Button size="small" variant="primary" disabled={busy || uploading || !replyBody.trim()} onclick={send}>Reply</Button></footer>
  </div>{/if}
</article>

<style>
  .thread{min-width:0;border-radius:12px;background:var(--surface);box-shadow:var(--shadow-surface)}
  .root{padding:18px 20px}
  .replies{display:grid;gap:8px;padding:0 12px 12px 48px}
  .reply{min-width:0;padding:15px 16px;border-radius:8px;background:var(--surface-muted)}
  .reply-composer{padding:0 20px 18px 48px}
  .reply-composer>header{display:flex;align-items:center;justify-content:space-between;gap:10px;margin:2px 0 7px;color:var(--text-muted);font-size:12px}
  .reply-composer>footer{display:flex;justify-content:flex-end;margin-top:8px}
  @media(max-width:600px){.root{padding:16px}.replies{padding:0 8px 8px 20px}.reply{padding:13px}.reply-composer{padding:0 12px 14px 20px}}
</style>
