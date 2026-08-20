<script lang="ts">
  import Bold from 'lucide-svelte/icons/bold';
  import Code from 'lucide-svelte/icons/code';
  import Italic from 'lucide-svelte/icons/italic';
  import Link from 'lucide-svelte/icons/link';
  import List from 'lucide-svelte/icons/list';
  import ListOrdered from 'lucide-svelte/icons/list-ordered';
  import Quote from 'lucide-svelte/icons/quote';
  import Button from './Button.svelte';
  import MarkdownBody from './MarkdownBody.svelte';

  let { value = $bindable(''), placeholder = 'Leave a comment', minHeight = 120 } = $props<{ value?: string; placeholder?: string; minHeight?: number }>();
  let mode = $state<'write' | 'preview'>('write');
  let textarea = $state<HTMLTextAreaElement>();

  function wrap(before: string, after = before, fallback = 'text') {
    if (!textarea) return;
    const start = textarea.selectionStart, end = textarea.selectionEnd;
    const selected = value.slice(start, end) || fallback;
    value = `${value.slice(0, start)}${before}${selected}${after}${value.slice(end)}`;
    requestAnimationFrame(() => { textarea?.focus(); textarea?.setSelectionRange(start + before.length, start + before.length + selected.length); });
  }

  function line(prefix: string) {
    if (!textarea) return;
    const start = value.lastIndexOf('\n', textarea.selectionStart - 1) + 1;
    value = `${value.slice(0, start)}${prefix}${value.slice(start)}`;
    requestAnimationFrame(() => { textarea?.focus(); textarea?.setSelectionRange(textarea.selectionStart + prefix.length, textarea.selectionEnd + prefix.length); });
  }
</script>

<div class="composer">
  <header><div class="modes"><Button class={`mode${mode === 'write' ? ' active' : ''}`} size="small" variant="ghost" onclick={() => (mode = 'write')}>Write</Button><Button class={`mode${mode === 'preview' ? ' active' : ''}`} size="small" variant="ghost" onclick={() => (mode = 'preview')}>Preview</Button></div>{#if mode === 'write'}<div class="tools"><Button icon size="small" variant="ghost" aria-label="Bold" onclick={() => wrap('**')}><Bold size={14} /></Button><Button icon size="small" variant="ghost" aria-label="Italic" onclick={() => wrap('_')}><Italic size={14} /></Button><Button icon size="small" variant="ghost" aria-label="Quote" onclick={() => line('> ')}><Quote size={14} /></Button><Button icon size="small" variant="ghost" aria-label="Inline code" onclick={() => wrap('`')}><Code size={14} /></Button><Button icon size="small" variant="ghost" aria-label="Link" onclick={() => wrap('[', '](https://)', 'label')}><Link size={14} /></Button><Button icon size="small" variant="ghost" aria-label="Bulleted list" onclick={() => line('- ')}><List size={14} /></Button><Button icon size="small" variant="ghost" aria-label="Numbered list" onclick={() => line('1. ')}><ListOrdered size={14} /></Button></div>{/if}</header>
  {#if mode === 'write'}<textarea bind:this={textarea} bind:value {placeholder} style:min-height={`${minHeight}px`}></textarea>{:else}<div class="preview" style:min-height={`${minHeight}px`}>{#if value.trim()}<MarkdownBody source={value} />{:else}<p>Nothing to preview</p>{/if}</div>{/if}
  <footer><span>Markdown supported</span></footer>
</div>

<style>
  .composer{overflow:hidden;border:1px solid var(--border);border-radius:7px;background:var(--surface)}header{display:flex;min-height:38px;align-items:center;justify-content:space-between;border-bottom:1px solid var(--border-subtle);background:var(--surface-muted)}.modes{display:flex;height:38px;align-items:center}.modes :global(.mode.button){position:relative;height:38px;border-radius:0;padding:0 13px;font-size:10px}.modes :global(.mode.button.active){color:var(--text-strong)}.modes :global(.mode.button.active:after){position:absolute;right:10px;bottom:-1px;left:10px;height:2px;background:var(--brand);content:''}.tools{display:flex;align-items:center;padding-right:7px}.tools :global(.button){width:29px;height:29px}textarea{display:block;width:100%;padding:12px;border:0;outline:0;resize:vertical;background:var(--surface);color:var(--text);font-family:inherit;font-size:12px;line-height:1.6}.preview{padding:12px;font-size:12px;line-height:1.6}.preview p{margin:0;color:var(--text-faint);font-size:12px}footer{display:flex;min-height:27px;align-items:center;padding:0 11px;border-top:1px solid var(--border-subtle);color:var(--text-faint);font-size:8px}
</style>
