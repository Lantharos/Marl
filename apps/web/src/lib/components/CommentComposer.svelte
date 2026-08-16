<script lang="ts">
  import MarkdownComposer from './MarkdownComposer.svelte';

  let {
    value = $bindable(''),
    placeholder = 'Leave a comment',
    submitLabel = 'Comment',
    avatar = '',
    minHeight = 110,
    busy = false,
    onSubmit,
    onCancel
  } = $props<{
    value?: string;
    placeholder?: string;
    submitLabel?: string;
    avatar?: string;
    minHeight?: number;
    busy?: boolean;
    onSubmit: () => void | Promise<void>;
    onCancel?: () => void;
  }>();
</script>

<div class="comment-composer" class:with-avatar={Boolean(avatar)}>
  {#if avatar}<span class="avatar">{avatar}</span>{/if}
  <div class="editor">
    <MarkdownComposer bind:value {placeholder} {minHeight} />
    <footer>
      {#if onCancel}<button onclick={onCancel}>Cancel</button>{/if}
      <button class="primary" disabled={busy || !value.trim()} onclick={onSubmit}>{submitLabel}</button>
    </footer>
  </div>
</div>

<style>
  .comment-composer{min-width:0}.comment-composer.with-avatar{display:grid;grid-template-columns:32px minmax(0,1fr);align-items:start;gap:10px}.avatar{display:grid;width:30px;height:30px;place-items:center;border-radius:50%;background:#d5b496;color:#3d2518;font-size:9px;font-weight:740}.editor{min-width:0}.editor>footer{display:flex;justify-content:flex-end;gap:7px;margin-top:8px}.editor>footer button{height:30px;padding:0 10px;border:1px solid var(--border);border-radius:6px;background:var(--surface);color:var(--text-muted);cursor:pointer;font-size:10px;font-weight:600}.editor>footer button:hover{background:var(--surface-muted);color:var(--text-strong)}.editor>footer button.primary{border-color:var(--brand);background:var(--brand);color:white}.editor>footer button:disabled{cursor:not-allowed;opacity:.45}
</style>
