<script lang="ts">
  import { tick } from 'svelte';
  import type { IssueComment } from '@marl/contracts';
  import Reply from '@lucide/svelte/icons/reply';
  import Button from '$lib/components/controls/Button.svelte';
  import ActionMenu from '$lib/components/overlays/ActionMenu.svelte';
  import MarkdownBody from '$lib/components/markdown/MarkdownBody.svelte';
  import MarkdownComposer from '$lib/components/markdown/MarkdownComposer.svelte';
  import Time from '$lib/components/page/Time.svelte';
  import UserProfileLink from '$lib/components/identity/UserProfileLink.svelte';
  import type { MarkdownContext } from '$lib/markdown/context';
  import { reporting } from '$lib/moderation/reporting.svelte';

  let {
    comment,
    viewerId,
    sequence,
    context,
    canReply,
    canConclude,
    busy,
    replyTarget,
    draftKey,
    onReply,
    onSave,
    onDelete,
    onConclude,
    onSource
  }: {
    comment: IssueComment;
    viewerId?: string;
    sequence?: number;
    context: MarkdownContext;
    canReply: boolean;
    canConclude: boolean;
    busy: boolean;
    replyTarget?: IssueComment;
    draftKey?: string;
    onReply: (comment: IssueComment, quote: string) => void;
    onSave: (id: string, body: string) => Promise<boolean>;
    onDelete: (id: string) => Promise<boolean>;
    onConclude: (comment: IssueComment) => void;
    onSource: (commentId: string) => Promise<void>;
  } = $props();
  let editing = $state(false);
  let deleting = $state(false);
  let editedBody = $state('');
  let uploading = $state(false);
  let bodyElement = $state<HTMLDivElement>();

  function reply() {
    const selection = window.getSelection();
    const selected =
      selection?.rangeCount && bodyElement?.contains(selection.getRangeAt(0).commonAncestorContainer)
        ? selection.toString().trim().slice(0, 4000)
        : '';
    onReply(
      comment,
      selected
        ? `${selected
            .split('\n')
            .map((line) => `> ${line}`)
            .join('\n')}\n\n`
        : ''
    );
  }
  async function save() {
    if (await onSave(comment.id, editedBody)) {
      editedBody = '';
      await tick();
      editing = false;
    }
  }
  const actions = $derived([
    ...(canConclude ? [{ label: 'Use as conclusion', onSelect: () => onConclude(comment) }] : []),
    ...(comment.canEdit
      ? [
          {
            label: 'Edit',
            onSelect: () => {
              editedBody = comment.body;
              editing = true;
            }
          },
          { label: 'Delete', danger: true, onSelect: () => (deleting = true) }
        ]
      : []),
    ...(viewerId && viewerId !== comment.authorId
      ? [
          {
            label: 'Report',
            onSelect: () => reporting.open({ type: 'issue_comment', id: comment.id, label: 'comment' })
          }
        ]
      : [])
  ]);
</script>

<article
  id={`comment-${comment.id}`}
  class="relative min-w-0 scroll-my-25 rounded-sm outline-none target:outline target:outline-offset-8 target:outline-brand focus-visible:outline focus-visible:outline-offset-8 focus-visible:outline-brand"
  tabindex="-1"
>
  <header class="flex min-h-7 flex-wrap items-center gap-x-2.5 gap-y-1.5 text-sm text-ink-muted">
    <UserProfileLink
      handle={comment.author}
      displayName={comment.authorDisplayName}
      avatarUrl={comment.authorAvatarUrl}
      kind={comment.authorKind}
      size={28}
      class="mr-auto"
    />
    <a class="text-xs text-ink-muted hover:text-ink-strong" href={`#comment-${comment.id}`}
      ><Time value={comment.createdAt} class="text-ink-muted" /></a
    >
    {#if comment.updatedAt !== comment.createdAt && !comment.deleted}<span class="text-xs text-ink-faint">edited</span
      >{/if}
    {#if !comment.deleted && actions.length}<div class="-mr-1.5">
        <ActionMenu label={`Options for ${comment.authorDisplayName}’s comment`} {actions} />
      </div>{/if}
  </header>
  {#if replyTarget && replyTarget.id !== comment.parentId}<a
      class="mt-2.5 flex w-fit items-center gap-1.5 text-xs text-ink-muted hover:text-brand"
      href={`#comment-${replyTarget.id}`}
      onclick={(event) => {
        event.preventDefault();
        void onSource(replyTarget!.id);
      }}><Reply size={13} />{replyTarget.authorDisplayName}</a
    >{/if}
  <div class="pt-3" bind:this={bodyElement}>
    {#if comment.deleted}<p class="text-sm text-ink-faint italic">Comment deleted.</p>
    {:else if editing}
      <MarkdownComposer
        bind:value={editedBody}
        bind:uploading
        {context}
        disabled={busy}
        compact
        minHeight={110}
        draftKey={draftKey ? `${draftKey}:edit:${comment.id}` : undefined}
        onsubmit={save}
      />
      <footer class="mt-3 flex flex-wrap justify-end gap-2">
        <Button size="small" variant="ghost" disabled={uploading} onclick={() => (editing = false)}>Cancel</Button>
        <Button size="small" variant="primary" loading={busy} disabled={uploading || !editedBody.trim()} onclick={save}
          >Save</Button
        >
      </footer>
    {:else}<MarkdownBody html={comment.bodyHtml} />{/if}
  </div>
  {#if deleting}
    <div class="mt-3 flex flex-wrap items-center justify-end gap-2 rounded-lg bg-danger-soft px-3 py-2">
      <span class="mr-auto text-sm text-danger">Delete this comment?</span>
      <Button size="small" variant="ghost" disabled={busy} onclick={() => (deleting = false)}>Cancel</Button>
      <Button
        size="small"
        variant="danger"
        loading={busy}
        onclick={async () => {
          if (await onDelete(comment.id)) deleting = false;
        }}>Delete</Button
      >
    </div>
  {:else if !comment.deleted && !editing && canReply}
    <Button class="mt-2 -ml-2" size="small" variant="ghost" onclick={reply}><Reply size={14} />Reply</Button>
  {/if}
  {#if sequence !== undefined}<span class="block h-px" data-read-sequence={sequence} aria-hidden="true"></span>{/if}
</article>
