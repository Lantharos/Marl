<script lang="ts">
  import type { ReviewThread } from '@marl/contracts';
  import ChevronRight from 'lucide-svelte/icons/chevron-right';
  import Pencil from 'lucide-svelte/icons/pencil';
  import Reply from 'lucide-svelte/icons/reply';
  import Trash2 from 'lucide-svelte/icons/trash-2';
  import type { ThreadCodeLine } from '$lib/diff';
  import type { MarkdownContext } from '$lib/markdown';
  import { ReviewThreadState } from '$lib/pulls/ReviewThreadState.svelte';
  import Button from './Button.svelte';
  import DiscussionEntry from './DiscussionEntry.svelte';
  import MarkdownBody from './MarkdownBody.svelte';
  import MarkdownComposer from './MarkdownComposer.svelte';

  let { thread, state: threadState = new ReviewThreadState(), busy, inline = false, grouped = false, interactive = true, canResolve = false, canModerate = false, viewerId, onLoadContext, onReply, onResolve, onEdit, onDelete, context } = $props<{
    thread: ReviewThread;
    state?: ReviewThreadState;
    busy: boolean;
    inline?: boolean;
    grouped?: boolean;
    interactive?: boolean;
    canResolve?: boolean;
    canModerate?: boolean;
    viewerId?: string;
    onLoadContext?: (thread: ReviewThread) => Promise<ThreadCodeLine[]>;
    onReply: (threadId: string, body: string) => Promise<void>;
    onResolve: (threadId: string, resolved: boolean) => Promise<void>;
    onEdit: (commentId: string, body: string) => Promise<void>;
    onDelete: (commentId: string) => Promise<void>;
    context?: MarkdownContext;
  }>();
  const rangeLabel = $derived(thread.startLine === thread.line ? `Line ${thread.line}` : `Lines ${thread.startLine}–${thread.line}`);
  let replyUploading = $state(false);
  let editUploading = $state(false);

  async function submitReply() { if (busy || replyUploading || !interactive || !threadState.replyBody.trim()) return; await onReply(thread.id, threadState.replyBody); threadState.replyBody = ''; threadState.replying = false; }
  async function submitEdit(id: string) { if (busy || editUploading || !threadState.editBody.trim()) return; await onEdit(id, threadState.editBody); threadState.editing = null; threadState.editBody = ''; }
  async function loadCodeContext() {
    if (!onLoadContext || inline || threadState.codeLines.length || threadState.contextLoading) return;
    threadState.contextLoading = true;
    try { threadState.codeLines = await onLoadContext(thread); } catch { threadState.codeLines = []; } finally { threadState.contextLoading = false; }
  }
  function nearViewport(node: HTMLElement) {
    if (!onLoadContext || inline) return;
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      observer.disconnect();
      void loadCodeContext();
    }, { rootMargin: '500px 0px' });
    observer.observe(node);
    return { destroy: () => observer.disconnect() };
  }
</script>

<article class="thread" class:inline class:grouped class:outdated={thread.outdated} class:collapsed={thread.resolved && !threadState.resolvedOpen} use:nearViewport>
  <header class="location">
    {#if thread.resolved}<Button class="collapse" icon size="small" variant="ghost" disabled={editUploading || replyUploading} aria-expanded={threadState.resolvedOpen} aria-label={threadState.resolvedOpen ? 'Collapse resolved conversation' : 'Expand resolved conversation'} onclick={() => (threadState.resolvedOpen = !threadState.resolvedOpen)}><ChevronRight size={14} /></Button>{/if}
    <strong title={thread.path}>{thread.path}</strong><span>{rangeLabel}</span>
    <div class="thread-actions">
      {#if thread.outdated}<span>Outdated</span>{:else if thread.resolved}<span class="resolved">Resolved</span>{#if canResolve}<Button size="small" variant="ghost" disabled={busy || editUploading || replyUploading} onclick={() => onResolve(thread.id, false)}>Reopen</Button>{/if}{:else if canResolve}<Button size="small" variant="ghost" disabled={busy || editUploading || replyUploading} onclick={() => onResolve(thread.id, true)}>Resolve</Button>{/if}
    </div>
  </header>
  {#if !thread.resolved || threadState.resolvedOpen}
    {#if !inline && threadState.codeLines.length}
      <div class="code-context" aria-label={`Code around ${rangeLabel.toLowerCase()}`}>
        {#each threadState.codeLines as line (line.key)}
          {#if line.kind === 'omitted'}<div class="omitted"><span></span><span>{line.count} more {line.count === 1 ? 'line' : 'lines'}</span></div>{:else}<div class="code-line {line.kind}" class:selected={line.selected}><span>{line.line}</span><pre>{line.text || ' '}</pre></div>{/if}
        {/each}
      </div>
    {/if}
    <div class="conversation">
      {#each thread.comments as comment (comment.id)}
        <DiscussionEntry author={comment.author} displayName={comment.authorDisplayName} avatarUrl={comment.authorAvatarUrl} createdAt={comment.createdAt} contained={false}>
          {#snippet actions()}
            {#if !comment.deleted && (comment.authorId === viewerId || canModerate)}{#if comment.authorId === viewerId}<Button variant="ghost" size="small" icon disabled={busy || editUploading} aria-label="Edit comment" onclick={() => { threadState.editing = comment.id; threadState.editBody = comment.body; }}><Pencil size={14} /></Button>{/if}{#if threadState.confirmingDelete === comment.id}<Button variant="danger-soft" size="small" disabled={busy || editUploading} onclick={async () => { await onDelete(comment.id); threadState.confirmingDelete = null; }}>Delete</Button><Button variant="ghost" size="small" onclick={() => (threadState.confirmingDelete = null)}>Cancel</Button>{:else}<Button variant="ghost" size="small" icon disabled={busy || editUploading} aria-label="Delete comment" onclick={() => (threadState.confirmingDelete = comment.id)}><Trash2 size={14} /></Button>{/if}{/if}
          {/snippet}
          {#snippet children()}
            {#if comment.deleted}<p class="deleted">Comment deleted</p>{:else if threadState.editing === comment.id}<MarkdownComposer bind:value={threadState.editBody} bind:uploading={editUploading} {context} disabled={busy} compact minHeight={76} /><footer><Button size="small" disabled={busy || editUploading} onclick={() => (threadState.editing = null)}>Cancel</Button><Button size="small" variant="primary" disabled={busy || editUploading || !threadState.editBody.trim()} onclick={() => submitEdit(comment.id)}>Save</Button></footer>{:else}<MarkdownBody source={comment.body} {context} />{/if}
          {/snippet}
        </DiscussionEntry>
      {/each}
      {#if interactive && !thread.outdated && !thread.resolved}
        {#if threadState.replying}<div class="reply-composer"><MarkdownComposer bind:value={threadState.replyBody} bind:uploading={replyUploading} {context} disabled={busy || !interactive} compact placeholder="Reply to this conversation" minHeight={76} /><footer><Button size="small" disabled={busy || replyUploading} onclick={() => (threadState.replying = false)}>Cancel</Button><Button size="small" variant="primary" disabled={busy || replyUploading || !threadState.replyBody.trim()} onclick={submitReply}>Reply</Button></footer></div>{:else}<Button class="reply" variant="ghost" size="small" onclick={() => (threadState.replying = true)}><Reply size={13} />Reply</Button>{/if}
      {/if}
    </div>
  {/if}
</article>

<style>
  .thread{min-width:0;content-visibility:auto;contain-intrinsic-size:auto 210px;padding:14px 16px 16px;border-radius:9px;background:var(--surface);box-shadow:var(--shadow-surface)}
  .thread.inline{margin:9px 10px;padding:12px;border-radius:8px;background:var(--surface-raised)}
  .thread.grouped{border-radius:7px;background:var(--surface-muted);box-shadow:none}
  .location{display:flex;flex-wrap:wrap;min-height:32px;align-items:center;gap:6px 10px;margin-bottom:12px}
  .collapsed .location{margin-bottom:0}
  .location strong{min-width:0;overflow:hidden;color:var(--text-strong);font:600 12px var(--font-mono);text-overflow:ellipsis;white-space:nowrap}
  .location>span{color:var(--text-muted);font-size:11px;white-space:nowrap}
  .thread-actions{display:flex;align-items:center;gap:6px;margin-left:auto}
  .thread-actions>span{color:var(--text-muted);font-size:11px}
  .thread-actions>.resolved{color:var(--success)}
  .location :global(.collapse.button){width:32px;height:32px;margin-left:-6px}
  .code-context{overflow-x:auto;margin:0 0 18px;border-radius:6px;background:var(--surface-muted);font:11px/23px var(--font-mono)}
  .code-line,.omitted{display:grid;grid-template-columns:38px auto;width:max-content;min-width:100%}
  .code-line>span,.omitted>span:first-child{padding-right:9px;color:var(--text-faint);text-align:right;user-select:none}
  .code-line pre{margin:0;padding:0 12px;color:var(--text-muted);font:inherit;white-space:pre}
  .code-line.selected{background:color-mix(in srgb,var(--brand-soft) 62%,transparent)}
  .code-line.selected>span{color:var(--text)}
  .code-line.added.selected{background:var(--success-soft)}
  .code-line.removed.selected{background:var(--danger-soft)}
  .omitted>span:last-child{padding-left:12px;color:var(--text-muted);font-family:inherit;font-style:italic}
  .conversation{display:grid;gap:22px}
  .deleted{margin:0;color:var(--text-muted);font-size:12px;font-style:italic}
  footer{display:flex;justify-content:flex-end;gap:6px;margin-top:8px}
  .conversation :global(.reply.button){width:max-content;margin-left:30px}
  .reply-composer{padding-left:35px}
  .inline .conversation{gap:18px}
  @media(max-width:600px){.thread{padding:12px}.thread.inline{margin-inline:6px}.reply-composer{padding-left:0}.conversation :global(.reply.button){margin-left:-5px}}
</style>
