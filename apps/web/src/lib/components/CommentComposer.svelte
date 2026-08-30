<script lang="ts">
  import Button from './Button.svelte';
  import MarkdownComposer from './MarkdownComposer.svelte';
  import type { MarkdownContext } from '$lib/markdown';

  let {
    value = $bindable(''),
    placeholder = 'Leave a comment',
    submitLabel = 'Comment',
    avatar = '',
    minHeight = 110,
    busy = false,
    onSubmit,
    onCancel,
    context
  } = $props<{
    value?: string;
    placeholder?: string;
    submitLabel?: string;
    avatar?: string;
    minHeight?: number;
    busy?: boolean;
    onSubmit: () => void | Promise<void>;
    onCancel?: () => void;
    context?: MarkdownContext;
  }>();
</script>

<div class="comment-composer" class:with-avatar={Boolean(avatar)}>
  {#if avatar}<span class="avatar">{avatar}</span>{/if}
  <div class="editor">
    <MarkdownComposer bind:value {context} {placeholder} {minHeight} />
    <footer>
      {#if onCancel}<Button size="small" onclick={onCancel}>Cancel</Button>{/if}
      <Button size="small" variant="primary" disabled={busy || !value.trim()} onclick={onSubmit}>{submitLabel}</Button>
    </footer>
  </div>
</div>

<style>
  .comment-composer{min-width:0}.comment-composer.with-avatar{display:grid;grid-template-columns:32px minmax(0,1fr);align-items:start;gap:10px}.avatar{display:grid;width:30px;height:30px;place-items:center;border-radius:50%;background:#d5b496;color:#3d2518;font-size:9px;font-weight:740}.editor{min-width:0}.editor>footer{display:flex;justify-content:flex-end;gap:7px;margin-top:8px}
</style>
