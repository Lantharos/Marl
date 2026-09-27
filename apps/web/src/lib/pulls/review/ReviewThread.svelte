<script lang="ts">
  import type { ReviewThread } from '@marl/contracts';
  import ChevronRight from '@lucide/svelte/icons/chevron-right';
  import Flag from '@lucide/svelte/icons/flag';
  import Pencil from '@lucide/svelte/icons/pencil';
  import Reply from '@lucide/svelte/icons/reply';
  import Trash2 from '@lucide/svelte/icons/trash';
  import type { ThreadCodeLine } from '$lib/code/diff';
  import type { MarkdownContext } from '$lib/markdown/context';
  import { reporting } from '$lib/moderation/reporting.svelte';
  import { ReviewThreadState } from '$lib/pulls/review/ReviewThreadState.svelte';
  import Button from '../../components/controls/Button.svelte';
  import DiscussionEntry from '../../components/discussion/DiscussionEntry.svelte';
  import MarkdownBody from '../../components/markdown/MarkdownBody.svelte';
  import MarkdownComposer from '../../components/markdown/MarkdownComposer.svelte';

  let {
    thread,
    state: threadState = new ReviewThreadState(),
    busy,
    inline = false,
    grouped = false,
    interactive = true,
    canResolve = false,
    canModerate = false,
    viewerId,
    onLoadContext,
    onReply,
    onResolve,
    onEdit,
    onDelete,
    context
  }: {
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
  } = $props();
  const rangeLabel = $derived(
    thread.startLine === thread.line ? `Line ${thread.line}` : `Lines ${thread.startLine}–${thread.line}`
  );
  let replyUploading = $state(false);
  let editUploading = $state(false);

  async function submitReply() {
    if (busy || replyUploading || !interactive || !threadState.replyBody.trim()) return;
    await onReply(thread.id, threadState.replyBody);
    threadState.replyBody = '';
    threadState.replying = false;
  }
  async function submitEdit(id: string) {
    if (busy || editUploading || !threadState.editBody.trim()) return;
    await onEdit(id, threadState.editBody);
    threadState.editing = null;
    threadState.editBody = '';
  }
  async function loadCodeContext() {
    if (!onLoadContext || inline || threadState.codeLines.length || threadState.contextLoading) return;
    threadState.contextLoading = true;
    try {
      threadState.codeLines = await onLoadContext(thread);
    } catch {
      threadState.codeLines = [];
    } finally {
      threadState.contextLoading = false;
    }
  }
  function nearViewport(node: HTMLElement) {
    if (!onLoadContext || inline) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer.disconnect();
        void loadCodeContext();
      },
      { rootMargin: '500px 0px' }
    );
    observer.observe(node);
    return { destroy: () => observer.disconnect() };
  }
</script>

<article
  data-review-thread={thread.resolved ? 'resolved' : 'open'}
  tabindex="-1"
  class={[
    'min-w-0 scroll-mt-30 outline-offset-2 [contain-intrinsic-size:auto_210px] [content-visibility:auto] focus-visible:outline-2 focus-visible:outline-brand',
    inline
      ? 'mx-2.5 my-2.5 rounded-lg bg-surface-raised p-3 shadow-surface'
      : grouped
        ? 'rounded-lg bg-surface-muted p-3 sm:p-3.5'
        : 'surface p-3 sm:px-4 sm:pt-3.5 sm:pb-4'
  ]}
  use:nearViewport
>
  <header
    class={[
      'flex min-h-8 flex-wrap items-center gap-x-2.5 gap-y-1.5',
      (!thread.resolved || threadState.resolvedOpen) && 'mb-3'
    ]}
  >
    {#if thread.resolved}<Button
        class="-ml-1.5"
        icon
        size="small"
        variant="ghost"
        disabled={editUploading || replyUploading}
        aria-expanded={threadState.resolvedOpen}
        aria-label={threadState.resolvedOpen ? 'Collapse resolved conversation' : 'Expand resolved conversation'}
        onclick={() => (threadState.resolvedOpen = !threadState.resolvedOpen)}><ChevronRight size={15} /></Button
      >{/if}
    <strong class="min-w-0 truncate font-mono text-xs font-semibold text-ink-strong" title={thread.path}
      >{thread.path}</strong
    >
    <span class="text-xs whitespace-nowrap text-ink-muted">{rangeLabel}</span>
    <div class="ml-auto flex items-center gap-1.5">
      {#if thread.outdated}<span class="text-xs text-ink-muted">Outdated</span>
      {:else if thread.resolved}<span class="text-xs font-medium text-success">Resolved</span>
        {#if canResolve}<Button
            size="small"
            variant="ghost"
            disabled={busy || editUploading || replyUploading}
            onclick={() => onResolve(thread.id, false)}>Reopen</Button
          >{/if}
      {:else if canResolve}<Button
          size="small"
          variant="ghost"
          disabled={busy || editUploading || replyUploading}
          onclick={() => onResolve(thread.id, true)}>Resolve</Button
        >{/if}
    </div>
  </header>
  {#if !thread.resolved || threadState.resolvedOpen}
    {#if !inline && threadState.codeLines.length}
      <div
        class="mb-4 overflow-x-auto rounded-md bg-surface-muted font-mono text-xs leading-[23px]"
        aria-label={`Code around ${rangeLabel.toLowerCase()}`}
      >
        {#each threadState.codeLines as line (line.key)}
          {#if line.kind === 'omitted'}<div class="grid w-max min-w-full grid-cols-[40px_auto]">
              <span></span><span class="pl-3 font-sans text-ink-muted italic"
                >{line.count} more {line.count === 1 ? 'line' : 'lines'}</span
              >
            </div>{:else}<div
              class={[
                'grid w-max min-w-full grid-cols-[40px_auto]',
                line.selected &&
                  (line.kind === 'added'
                    ? 'bg-success-soft'
                    : line.kind === 'removed'
                      ? 'bg-danger-soft'
                      : 'bg-brand-soft')
              ]}
            >
              <span class={['pr-2.5 text-right select-none', line.selected ? 'text-ink' : 'text-ink-faint']}
                >{line.line}</span
              >
              <pre class="m-0 px-3 font-[inherit] whitespace-pre text-ink-muted">{line.text || ' '}</pre>
            </div>{/if}
        {/each}
      </div>
    {/if}
    <div class={['grid', inline ? 'gap-4.5' : 'gap-5.5']}>
      {#each thread.comments as comment (comment.id)}
        <DiscussionEntry
          author={comment.author}
          displayName={comment.authorDisplayName}
          avatarUrl={comment.authorAvatarUrl}
          kind={comment.authorKind}
          createdAt={comment.createdAt}
          contained={false}
        >
          {#snippet actions()}
            {#if !comment.deleted && (comment.authorId === viewerId || canModerate)}
              {#if threadState.confirmingDelete === comment.id}
                <Button
                  variant="danger-soft"
                  size="small"
                  disabled={busy || editUploading}
                  onclick={async () => {
                    await onDelete(comment.id);
                    threadState.confirmingDelete = null;
                  }}>Delete</Button
                >
                <Button variant="ghost" size="small" onclick={() => (threadState.confirmingDelete = null)}
                  >Cancel</Button
                >
              {:else}
                {#if comment.authorId === viewerId}<Button
                    variant="ghost"
                    size="small"
                    icon
                    disabled={busy || editUploading}
                    aria-label="Edit comment"
                    onclick={() => {
                      threadState.editing = comment.id;
                      threadState.editBody = comment.body;
                    }}><Pencil size={14} /></Button
                  >{/if}
                <Button
                  variant="ghost"
                  size="small"
                  icon
                  disabled={busy || editUploading}
                  aria-label="Delete comment"
                  onclick={() => (threadState.confirmingDelete = comment.id)}><Trash2 size={14} /></Button
                >
              {/if}
            {/if}
            {#if viewerId && !comment.deleted && comment.authorId !== viewerId}<Button
                variant="ghost"
                size="small"
                icon
                aria-label="Report comment"
                title="Report comment"
                onclick={() => reporting.open({ type: 'review_comment', id: comment.id, label: 'comment' })}
                ><Flag size={14} /></Button
              >{/if}
          {/snippet}
          {#snippet children()}
            {#if comment.deleted}<p class="text-sm text-ink-muted italic">Comment deleted</p>
            {:else if threadState.editing === comment.id}
              <MarkdownComposer
                bind:value={threadState.editBody}
                bind:uploading={editUploading}
                {context}
                disabled={busy}
                compact
                minHeight={76}
                onsubmit={() => submitEdit(comment.id)}
              />
              <footer class="mt-2 flex justify-end gap-1.5">
                <Button size="small" disabled={busy || editUploading} onclick={() => (threadState.editing = null)}
                  >Cancel</Button
                >
                <Button
                  size="small"
                  variant="primary"
                  disabled={busy || editUploading || !threadState.editBody.trim()}
                  onclick={() => submitEdit(comment.id)}>Save</Button
                >
              </footer>
            {:else}<MarkdownBody html={comment.bodyHtml} />{/if}
          {/snippet}
        </DiscussionEntry>
      {/each}
      {#if interactive && !thread.outdated && !thread.resolved}
        {#if threadState.replying}
          <div class="sm:pl-9">
            <MarkdownComposer
              bind:value={threadState.replyBody}
              bind:uploading={replyUploading}
              {context}
              disabled={busy || !interactive}
              compact
              placeholder="Reply to this conversation"
              minHeight={76}
              onsubmit={submitReply}
            />
            <footer class="mt-2 flex justify-end gap-1.5">
              <Button size="small" disabled={busy || replyUploading} onclick={() => (threadState.replying = false)}
                >Cancel</Button
              >
              <Button
                size="small"
                variant="primary"
                disabled={busy || replyUploading || !threadState.replyBody.trim()}
                onclick={submitReply}>Reply</Button
              >
            </footer>
          </div>
        {:else}<Button class="w-max sm:ml-7" variant="ghost" size="small" onclick={() => (threadState.replying = true)}
            ><Reply size={14} />Reply</Button
          >{/if}
      {/if}
    </div>
  {/if}
</article>
