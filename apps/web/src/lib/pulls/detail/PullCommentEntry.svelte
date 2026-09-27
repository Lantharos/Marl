<script lang="ts">
  import type { PullRequestComment } from '@marl/contracts';
  import Button from '$lib/components/controls/Button.svelte';
  import DiscussionEntry from '$lib/components/discussion/DiscussionEntry.svelte';
  import MarkdownBody from '$lib/components/markdown/MarkdownBody.svelte';
  import MarkdownComposer from '$lib/components/markdown/MarkdownComposer.svelte';
  import ActionMenu from '$lib/components/overlays/ActionMenu.svelte';
  import type { MarkdownContext } from '$lib/markdown/context';
  import { reporting } from '$lib/moderation/reporting.svelte';

  let {
    comment,
    context,
    busy,
    viewerId,
    canModerate,
    onSave,
    onDelete
  }: {
    comment: PullRequestComment;
    context: MarkdownContext;
    busy: boolean;
    viewerId?: string;
    canModerate: boolean;
    onSave: (id: string, body: string) => Promise<boolean>;
    onDelete: (id: string) => Promise<boolean>;
  } = $props();
  let editing = $state(false);
  let deleting = $state(false);
  let editedBody = $state('');
  let uploading = $state(false);
  const own = $derived(comment.authorId === viewerId);
  const report = $derived(
    viewerId && !own
      ? [
          {
            label: 'Report',
            onSelect: () => reporting.open({ type: 'pull_comment', id: comment.id, label: 'comment' })
          }
        ]
      : []
  );
  const menu = $derived(
    comment.deleted
      ? []
      : [
          ...(own
            ? [
                {
                  label: 'Edit',
                  onSelect: () => {
                    editedBody = comment.body;
                    editing = true;
                  }
                }
              ]
            : []),
          ...(own || canModerate ? [{ label: 'Delete', danger: true, onSelect: () => (deleting = true) }] : []),
          ...report
        ]
  );

  async function save() {
    if (!editedBody.trim() || uploading) return;
    if (await onSave(comment.id, editedBody)) editing = false;
  }
</script>

<DiscussionEntry
  author={comment.author}
  displayName={comment.authorDisplayName}
  avatarUrl={comment.authorAvatarUrl}
  kind={comment.authorKind}
  createdAt={comment.createdAt}
>
  {#snippet actions()}{#if menu.length}<ActionMenu
        label={`Options for ${comment.authorDisplayName}’s comment`}
        actions={menu}
      />{/if}{/snippet}
  {#if comment.deleted}<p class="text-sm text-ink-faint italic">Comment deleted.</p>
  {:else if editing}
    <MarkdownComposer
      bind:value={editedBody}
      bind:uploading
      {context}
      disabled={busy}
      compact
      minHeight={82}
      onsubmit={save}
    />
    <footer class="mt-3 flex justify-end gap-2">
      <Button size="small" variant="ghost" disabled={uploading} onclick={() => (editing = false)}>Cancel</Button>
      <Button size="small" variant="primary" loading={busy} disabled={uploading || !editedBody.trim()} onclick={save}
        >Save</Button
      >
    </footer>
  {:else}<MarkdownBody html={comment.bodyHtml} />{/if}
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
  {/if}
</DiscussionEntry>
