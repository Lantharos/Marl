<script lang="ts">
  import Button from '../controls/Button.svelte';
  import MarkdownComposer from './MarkdownComposer.svelte';
  import type { MarkdownContext } from '$lib/markdown/context';

  let {
    value = $bindable(''),
    placeholder = 'Leave a comment',
    submitLabel = 'Comment',
    minHeight = 110,
    busy = false,
    onSubmit,
    onCancel,
    context
  }: {
    value?: string;
    placeholder?: string;
    submitLabel?: string;
    minHeight?: number;
    busy?: boolean;
    onSubmit: () => void | Promise<void>;
    onCancel?: () => void;
    context?: MarkdownContext;
  } = $props();
  let uploading = $state(false);

  async function submit() {
    if (busy || uploading || !value.trim()) return;
    await onSubmit();
  }
</script>

<div class="min-w-0">
  <MarkdownComposer bind:value bind:uploading {context} {placeholder} {minHeight} disabled={busy} onsubmit={submit} />
  <footer class="mt-2.5 flex justify-end gap-2">
    {#if onCancel}<Button size="small" disabled={busy || uploading} onclick={onCancel}>Cancel</Button>{/if}
    <Button size="small" variant="primary" loading={busy} disabled={uploading || !value.trim()} onclick={submit}
      >{submitLabel}</Button
    >
  </footer>
</div>
