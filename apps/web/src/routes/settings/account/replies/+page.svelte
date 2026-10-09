<script lang="ts">
  import { untrack } from 'svelte';
  import type { SavedReply } from '@marl/contracts';
  import MessageSquareText from '@lucide/svelte/icons/message-square-text';
  import Pencil from '@lucide/svelte/icons/pencil';
  import Trash2 from '@lucide/svelte/icons/trash';
  import { MarlApiError } from '#lib/api.js';
  import Button from '#lib/components/controls/Button.svelte';
  import Field from '#lib/components/controls/Field.svelte';
  import EmptyState from '#lib/components/feedback/EmptyState.svelte';
  import Notice from '#lib/components/feedback/Notice.svelte';
  import MarkdownComposer from '#lib/components/markdown/MarkdownComposer.svelte';
  import ConfirmDialog from '#lib/components/overlays/ConfirmDialog.svelte';
  import Modal from '#lib/components/overlays/Modal.svelte';
  import SettingEntry from '#lib/components/settings/SettingEntry.svelte';
  import SettingsHeader from '#lib/components/settings/SettingsHeader.svelte';
  import SettingsGroup from '#lib/components/settings/SettingsGroup.svelte';
  import { savedReplies } from '#lib/saved-replies/saved-replies.svelte.js';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
  savedReplies.seed(untrack(() => data.replies));
  let editing = $state<SavedReply | 'new' | null>(null);
  let title = $state('');
  let body = $state('');
  let removing = $state<SavedReply | null>(null);
  let busy = $state(false);
  let error = $state('');

  function edit(reply: SavedReply | 'new') {
    editing = reply;
    title = reply === 'new' ? '' : reply.title;
    body = reply === 'new' ? '' : reply.body;
    error = '';
  }

  async function save() {
    if (busy || !editing || !title.trim() || !body.trim()) return;
    busy = true;
    error = '';
    try {
      if (editing === 'new') await savedReplies.create(title.trim(), body);
      else await savedReplies.update(editing.id, title.trim(), body);
      editing = null;
    } catch (cause) {
      error = cause instanceof MarlApiError ? cause.message : 'The reply could not be saved.';
    } finally {
      busy = false;
    }
  }

  async function remove(reply: SavedReply) {
    busy = true;
    error = '';
    try {
      await savedReplies.remove(reply.id);
      removing = null;
    } catch (cause) {
      error = cause instanceof MarlApiError ? cause.message : 'The reply could not be deleted.';
    } finally {
      busy = false;
    }
  }
</script>

<svelte:head><title>Saved replies · Marl</title></svelte:head>
<SettingsHeader
  title="Saved replies"
  description="Text you write often, ready to insert into any comment or review with Ctrl . or the reply button."
>
  {#snippet action()}<Button size="small" onclick={() => edit('new')}>New reply</Button>{/snippet}
</SettingsHeader>
<SettingsGroup>
  {#each savedReplies.replies as reply (reply.id)}
    <SettingEntry icon={MessageSquareText} title={reply.title}>
      <p class="line-clamp-2 whitespace-pre-line">{reply.body}</p>
      {#snippet actions()}
        <Button variant="ghost" size="small" icon aria-label={`Edit ${reply.title}`} onclick={() => edit(reply)}
          ><Pencil size={15} /></Button
        >
        <Button
          variant="ghost"
          size="small"
          icon
          aria-label={`Delete ${reply.title}`}
          onclick={() => {
            error = '';
            removing = reply;
          }}><Trash2 size={15} /></Button
        >
      {/snippet}
    </SettingEntry>
  {:else}
    <EmptyState
      compact
      icon={MessageSquareText}
      title="No saved replies"
      description="Save a reply here, or from any comment box with the reply button."
    />
  {/each}
</SettingsGroup>

<Modal
  open={editing !== null}
  title={editing === 'new' ? 'New saved reply' : 'Edit saved reply'}
  onClose={() => !busy && (editing = null)}
>
  <form
    id="saved-reply-form"
    class="grid gap-5"
    onsubmit={(event) => {
      event.preventDefault();
      void save();
    }}
  >
    <Field label="Title"
      ><input class="field" bind:value={title} maxlength="100" placeholder="Needs a test" data-1p-ignore /></Field
    >
    <MarkdownComposer bind:value={body} placeholder="Reply text" minHeight={140} compact onsubmit={save} />
  </form>
  {#if error}<Notice class="mt-4">{error}</Notice>{/if}
  {#snippet actions()}
    <Button size="small" disabled={busy} onclick={() => (editing = null)}>Cancel</Button>
    <Button
      size="small"
      type="submit"
      form="saved-reply-form"
      variant="primary"
      loading={busy}
      disabled={!title.trim() || !body.trim()}>Save reply</Button
    >
  {/snippet}
</Modal>

<ConfirmDialog
  open={removing !== null}
  title="Delete saved reply?"
  confirmLabel="Delete reply"
  {busy}
  {error}
  onConfirm={() => removing && void remove(removing)}
  onClose={() => (removing = null)}
>
  <strong>{removing?.title}</strong> will no longer be available in comment boxes.
</ConfirmDialog>
