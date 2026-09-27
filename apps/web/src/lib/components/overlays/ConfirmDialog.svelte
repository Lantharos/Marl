<script lang="ts">
  import type { Snippet } from 'svelte';
  import Button from '../controls/Button.svelte';
  import Notice from '../feedback/Notice.svelte';
  import Modal from './Modal.svelte';

  let {
    open,
    title,
    confirmLabel,
    tone = 'danger',
    busy = false,
    error = '',
    onConfirm,
    onClose,
    children
  }: {
    open: boolean;
    title: string;
    confirmLabel: string;
    tone?: 'danger' | 'primary';
    busy?: boolean;
    error?: string;
    onConfirm: () => void;
    onClose: () => void;
    children: Snippet;
  } = $props();
</script>

<Modal {open} {title} size="small" onClose={() => !busy && onClose()}>
  <p class="text-sm leading-relaxed text-pretty text-ink-muted [&_strong]:break-words [&_strong]:text-ink-strong">
    {@render children()}
  </p>
  {#if error}<Notice class="mt-4">{error}</Notice>{/if}
  {#snippet actions()}
    <Button size="small" disabled={busy} onclick={onClose}>Cancel</Button>
    <Button size="small" variant={tone} loading={busy} onclick={onConfirm}>{confirmLabel}</Button>
  {/snippet}
</Modal>
