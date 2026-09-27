<script lang="ts">
  import Button from '$lib/components/controls/Button.svelte';
  import Field from '$lib/components/controls/Field.svelte';
  import MarkdownComposer from '$lib/components/markdown/MarkdownComposer.svelte';
  import Modal from '$lib/components/overlays/Modal.svelte';
  import type { MarkdownContext } from '$lib/markdown/context';

  let {
    open,
    title: initialTitle,
    body: initialBody,
    context,
    busy,
    onSave,
    onClose
  }: {
    open: boolean;
    title: string;
    body: string;
    context: MarkdownContext;
    busy: boolean;
    onSave: (title: string, body: string) => Promise<boolean>;
    onClose: () => void;
  } = $props();
  let title = $state('');
  let body = $state('');
  let uploading = $state(false);

  $effect.pre(() => {
    if (!open) return;
    title = initialTitle;
    body = initialBody;
  });

  async function save() {
    if (uploading || title.trim().length < 3) return;
    if (await onSave(title, body)) onClose();
  }
</script>

<Modal {open} size="large" title="Edit pull" onClose={() => !uploading && !busy && onClose()}>
  <div class="grid gap-5">
    <Field label="Title"><input class="field" bind:value={title} maxlength="240" /></Field>
    <Field label="Description"
      ><MarkdownComposer bind:uploading bind:value={body} {context} minHeight={180} onsubmit={save} /></Field
    >
  </div>
  {#snippet actions()}
    <Button size="small" disabled={uploading || busy} onclick={onClose}>Cancel</Button>
    <Button size="small" variant="primary" loading={busy} disabled={uploading || title.trim().length < 3} onclick={save}
      >Save changes</Button
    >
  {/snippet}
</Modal>
