<script lang="ts">
  import type { ReviewThread } from '@marl/contracts';
  import ChevronRight from '@lucide/svelte/icons/chevron-right';
  import CircleCheck from '@lucide/svelte/icons/circle-check';
  import FileCode from '@lucide/svelte/icons/file-code';
  import Button from '#lib/components/controls/Button.svelte';
  import MarkdownComposer from '#lib/components/markdown/MarkdownComposer.svelte';
  import type { Discussion } from './discussion.svelte';
  import Message from './Message.svelte';
  import ThreadCode from './ThreadCode.svelte';

  let {
    discussion,
    thread,
    inline = false
  }: { discussion: Discussion; thread: ReviewThread; inline?: boolean } = $props();
  const threadState = $derived(discussion.pageState.timeline.threadState(thread.id));
  const open = $derived(!thread.resolved || threadState.resolvedOpen);
  const range = $derived(thread.startLine === thread.line ? `${thread.line}` : `${thread.startLine}–${thread.line}`);
  const visible = $derived(thread.comments.filter((comment, index) => !comment.deleted || index === 0));
  let uploading = $state(false);

  async function reply() {
    if (discussion.pageState.busy || uploading || !threadState.replyBody.trim()) return;
    await discussion.pageState.reply(thread.id, threadState.replyBody);
    threadState.replyBody = '';
    threadState.replying = false;
  }
</script>

<article
  data-review-thread={thread.resolved ? 'resolved' : 'open'}
  class={['min-w-0 rounded-xl', inline ? 'bg-surface-raised shadow-surface' : 'bg-surface']}
>
  <header class="flex min-h-10 items-center gap-2 px-3 text-xs">
    {#if thread.resolved}<button
        type="button"
        class="flex min-w-0 flex-1 items-center gap-2 text-left text-ink-muted hover:text-ink-strong"
        aria-expanded={threadState.resolvedOpen}
        onclick={() => (threadState.resolvedOpen = !threadState.resolvedOpen)}
        ><ChevronRight
          size={14}
          class={['shrink-0 transition-transform', threadState.resolvedOpen && 'rotate-90']}
        /><CircleCheck size={14} class="shrink-0 text-success" /><span class="truncate font-mono"
          >{thread.path}:{range}</span
        ><span class="shrink-0">· {thread.comments.length} {thread.comments.length === 1 ? 'message' : 'messages'}</span
        ></button
      >{:else}<span class="flex min-w-0 flex-1 items-center gap-2 text-ink-muted"
        ><FileCode size={14} class="shrink-0" /><span class="flex min-w-0 font-mono"
          ><span class="truncate text-ink">{thread.path}</span><span class="shrink-0">:{range}</span></span
        >{#if thread.outdated}<span class="shrink-0 text-ink-faint">· outdated</span>{/if}</span
      >{/if}
    {#if discussion.pull.canModerate && discussion.interactive}<Button
        size="small"
        variant="ghost"
        class="h-7 shrink-0 px-2 text-xs"
        disabled={discussion.pageState.busy}
        onclick={() => discussion.pageState.setThreadResolved(thread.id, !thread.resolved)}
        >{thread.resolved ? 'Reopen' : 'Resolve'}</Button
      >{/if}
  </header>
  {#if open}
    {#if !inline}<ThreadCode {discussion} {thread} state={threadState} />{/if}
    <div class="grid gap-4 px-3 pt-2 pb-3">
      {#each visible as comment (comment.id)}
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
          context={discussion.context}
          busy={discussion.pageState.busy}
          size="small"
          actions={discussion.threadCommentActions(comment)}
          bind:editing={
            () => discussion.editing === comment.id, (value) => (discussion.editing = value ? comment.id : null)
          }
          onSave={discussion.saveThreadComment(comment.id)}
        />
      {/each}
      {#if discussion.interactive}
        {#if threadState.replying || threadState.replyBody}<div class="pl-8.5">
            <MarkdownComposer
              bind:value={threadState.replyBody}
              bind:uploading
              variant="inline"
              minHeight="44px"
              placeholder="Reply"
              draftKey="thread:{thread.id}"
              context={discussion.context}
              disabled={discussion.pageState.busy}
              onsubmit={reply}
            >
              {#snippet actions()}
                <Button
                  size="small"
                  variant="ghost"
                  onclick={() => ((threadState.replying = false), (threadState.replyBody = ''))}>Cancel</Button
                >
                <Button
                  size="small"
                  variant="primary"
                  loading={discussion.pageState.busy}
                  disabled={!threadState.replyBody.trim() || uploading}
                  onclick={reply}>Reply</Button
                >
              {/snippet}
            </MarkdownComposer>
          </div>{:else}<button
            type="button"
            class="ml-8.5 flex h-8 items-center rounded-lg px-2.5 text-left text-sm text-ink-faint transition-colors hover:bg-surface-hover hover:text-ink-muted"
            onclick={() => (threadState.replying = true)}>Reply…</button
          >{/if}
      {/if}
    </div>
  {/if}
</article>
