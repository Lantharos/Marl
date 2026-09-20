<script lang="ts">
  import { onDestroy, tick } from 'svelte';
  import Bold from 'lucide-svelte/icons/bold';
  import Code from 'lucide-svelte/icons/code';
  import Italic from 'lucide-svelte/icons/italic';
  import Link from 'lucide-svelte/icons/link';
  import List from 'lucide-svelte/icons/list';
  import ListOrdered from 'lucide-svelte/icons/list-ordered';
  import Quote from 'lucide-svelte/icons/quote';
  import Paperclip from 'lucide-svelte/icons/paperclip';
  import FileImage from 'lucide-svelte/icons/file-image';
  import Film from 'lucide-svelte/icons/film';
  import RotateCw from 'lucide-svelte/icons/rotate-cw';
  import X from 'lucide-svelte/icons/x';
  import Button from './Button.svelte';
  import MarkdownBody from './MarkdownBody.svelte';
  import type { MarkdownContext } from '$lib/markdown';
  import { mediaAccept, mediaFileError, MediaUploadQueue } from '$lib/media/uploads.svelte';

  let { value = $bindable(''), uploading = $bindable(false), placeholder = 'Leave a comment', minHeight = 120, compact = false, disabled = false, context, draftKey } = $props<{ value?: string; uploading?: boolean; placeholder?: string; minHeight?: number; compact?: boolean; disabled?: boolean; context?: MarkdownContext; draftKey?: string }>();
  let mode = $state<'write' | 'preview'>('write');
  let textarea = $state<HTMLTextAreaElement>();
  let picker = $state<HTMLInputElement>();
  let dragOver = $state(false);
  let attachmentError = $state('');
  const uploads = new MediaUploadQueue(replaceUpload, (pending) => { uploading = pending; });
  onDestroy(() => uploads.dispose());

  function rememberDraft(key: string | undefined) {
    return () => {
      if (!key) return;
      const storageKey = `marl:composer:${key}`;
      try {
        const saved = sessionStorage.getItem(storageKey);
        if (saved !== null) value = saved;
      } catch {}
      return $effect.root(() => {
        $effect(() => {
          const body = value.replaceAll(/!\[[^\]\r\n]*\]\(marl-upload:[a-z0-9-]+\)/g, '');
          try {
            if (body.trim()) sessionStorage.setItem(storageKey, body);
            else sessionStorage.removeItem(storageKey);
          } catch {}
        });
      });
    };
  }

  function replaceUpload(marker: string, replacement: string) {
    const offset = value.indexOf(marker);
    if (offset < 0) return;
    const start = textarea?.selectionStart ?? 0;
    const end = textarea?.selectionEnd ?? 0;
    const shift = (position: number) => position <= offset ? position : position < offset + marker.length ? offset + replacement.length : position + replacement.length - marker.length;
    value = `${value.slice(0, offset)}${replacement}${value.slice(offset + marker.length)}`;
    void tick().then(() => textarea?.setSelectionRange(shift(start), shift(end)));
  }

  async function attachFiles(files: File[]) {
    if (disabled || !context?.owner || !context.repository || !files.length) return;
    attachmentError = '';
    const accepted = files.filter((file) => {
      const error = mediaFileError(file);
      if (error) attachmentError = error;
      return !error;
    });
    const remaining = Math.max(0, 8 - uploads.entries.length);
    if (accepted.length > remaining) attachmentError = 'Attach up to 8 files at a time.';
    const batch = accepted.slice(0, remaining);
    if (!batch.length) return;
    const start = textarea?.selectionStart ?? value.length;
    const end = textarea?.selectionEnd ?? value.length;
    const markdown = uploads.enqueue(batch, context);
    const before = value.slice(0, start);
    const after = value.slice(end);
    const insertion = `${before && !before.endsWith('\n\n') ? '\n\n' : ''}${markdown}${after && !after.startsWith('\n\n') ? '\n\n' : '\n'}`;
    value = `${before}${insertion}${after}`;
    mode = 'write';
    uploads.start();
    await tick();
    textarea?.focus();
    textarea?.setSelectionRange(start + insertion.length, start + insertion.length);
  }

  function paste(event: ClipboardEvent) {
    if (disabled || !context) return;
    const files = [...(event.clipboardData?.files ?? [])];
    if (!files.length) return;
    event.preventDefault();
    void attachFiles(files);
  }

  function drag(event: DragEvent) {
    if (disabled || !context || !event.dataTransfer?.types.includes('Files')) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
    dragOver = true;
  }

  function drop(event: DragEvent) {
    if (disabled || !context || !event.dataTransfer?.files.length) return;
    event.preventDefault();
    dragOver = false;
    void attachFiles([...event.dataTransfer.files]);
  }

  function wrap(before: string, after = before, fallback = 'text') {
    if (disabled || !textarea) return;
    const start = textarea.selectionStart, end = textarea.selectionEnd;
    const selected = value.slice(start, end) || fallback;
    value = `${value.slice(0, start)}${before}${selected}${after}${value.slice(end)}`;
    requestAnimationFrame(() => { textarea?.focus(); textarea?.setSelectionRange(start + before.length, start + before.length + selected.length); });
  }

  function line(prefix: string) {
    if (disabled || !textarea) return;
    const start = value.lastIndexOf('\n', textarea.selectionStart - 1) + 1;
    value = `${value.slice(0, start)}${prefix}${value.slice(start)}`;
    requestAnimationFrame(() => { textarea?.focus(); textarea?.setSelectionRange(textarea.selectionStart + prefix.length, textarea.selectionEnd + prefix.length); });
  }
</script>

<div class="composer" class:drag-over={dragOver} role="group" aria-label="Markdown editor" {@attach rememberDraft(draftKey)} ondragover={drag} ondragleave={() => (dragOver = false)} ondrop={drop}>
  <header><div class="modes"><Button class={`mode${mode === 'write' ? ' active' : ''}`} size="small" variant="ghost" onclick={() => (mode = 'write')}>Write</Button><Button class={`mode${mode === 'preview' ? ' active' : ''}`} size="small" variant="ghost" onclick={() => (mode = 'preview')}>Preview</Button></div>{#if mode === 'write'}<fieldset class="tools" {disabled} aria-label="Text formatting"><Button icon size="small" variant="ghost" aria-label="Bold" onclick={() => wrap('**')}><Bold size={14} /></Button><Button icon size="small" variant="ghost" aria-label="Italic" onclick={() => wrap('_')}><Italic size={14} /></Button><Button icon size="small" variant="ghost" aria-label="Quote" onclick={() => line('> ')}><Quote size={14} /></Button><Button icon size="small" variant="ghost" aria-label="Inline code" onclick={() => wrap('`')}><Code size={14} /></Button><Button icon size="small" variant="ghost" aria-label="Link" onclick={() => wrap('[', '](https://)', 'label')}><Link size={14} /></Button><Button icon size="small" variant="ghost" aria-label="Bulleted list" onclick={() => line('- ')}><List size={14} /></Button><Button icon size="small" variant="ghost" aria-label="Numbered list" onclick={() => line('1. ')}><ListOrdered size={14} /></Button></fieldset>{/if}</header>
  {#if mode === 'write'}<textarea bind:this={textarea} bind:value {placeholder} {disabled} aria-label={placeholder} onpaste={paste} style:min-height={`${minHeight}px`}></textarea>{:else}<div class="preview" style:min-height={`${minHeight}px`}>{#if value.trim()}<MarkdownBody source={value} {context} />{:else}<p>Nothing to preview</p>{/if}</div>{/if}
  {#if uploads.entries.length}<div class="uploads" aria-label="Attachments">{#each uploads.entries as entry (entry.id)}<div class="upload" class:failed={entry.status === 'failed'}>{#if entry.file.type.startsWith('video/')}<Film size={17} />{:else}<FileImage size={17} />{/if}<div class="upload-detail"><span class="filename">{entry.file.name}</span>{#if entry.error}<span class="upload-error" role="alert">{entry.error}</span>{:else}<div class="upload-progress" role="progressbar" aria-label={`Uploading ${entry.file.name}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={entry.progress}><span style:width={`${entry.progress}%`}></span></div>{/if}</div>{#if entry.status === 'failed'}<Button icon size="small" variant="ghost" aria-label={`Retry ${entry.file.name}`} onclick={() => uploads.retry(entry)}><RotateCw size={14} /></Button>{:else}<span class="percent">{entry.status === 'queued' ? 'Queued' : `${entry.progress}%`}</span>{/if}<Button icon size="small" variant="ghost" aria-label={`Remove ${entry.file.name}`} onclick={() => uploads.remove(entry)}><X size={14} /></Button></div>{/each}</div>{/if}
  {#if attachmentError}<p class="attachment-error" role="alert">{attachmentError}</p>{/if}
  {#if !compact || (context && !disabled)}<footer>{#if context?.owner && context.repository && !disabled}<input bind:this={picker} type="file" accept={mediaAccept} multiple hidden onchange={(event) => { void attachFiles([...event.currentTarget.files ?? []]); event.currentTarget.value = ''; }} /><Button size="small" variant="ghost" class="attach-button" onclick={() => picker?.click()}><Paperclip size={14} /><span>Attach</span></Button>{/if}{#if !compact}<span>{context && !disabled ? 'Paste or drop images and videos' : 'Markdown supported'}</span>{/if}</footer>{/if}
</div>

<style>
  .composer{min-width:0;overflow:hidden;border-radius:9px;background:var(--surface);box-shadow:var(--shadow-surface);--markdown-font-size:13px}
  .composer:has(textarea:focus){outline:1px solid var(--brand);outline-offset:0}
  .composer.drag-over{outline:2px solid var(--brand);outline-offset:2px}
  header{display:flex;flex-wrap:wrap;min-height:42px;align-items:center;justify-content:space-between;gap:0 12px;padding:4px 6px;background:var(--surface-muted)}
  .modes{display:flex;align-items:center;gap:2px}
  .modes :global(.mode.button){height:32px;padding:0 12px;font-size:11px}
  .modes :global(.mode.button.active){background:var(--surface);color:var(--text-strong)}
  .tools{display:flex;flex-wrap:wrap;align-items:center;min-width:0;margin:0;padding:0;border:0}
  .tools[disabled]{opacity:.5}
  .tools :global(.button){width:32px;height:32px}
  textarea{display:block;width:100%;padding:14px;border:0;outline:0;resize:vertical;background:var(--surface);color:var(--text);font-family:inherit;font-size:13px;line-height:1.65}
  textarea:disabled{cursor:not-allowed;color:var(--text-muted)}
  .preview{padding:14px;font-size:13px;line-height:1.65}
  .preview p{margin:0;color:var(--text-muted)}
  footer{display:flex;min-height:34px;align-items:center;gap:10px;padding:2px 9px;color:var(--text-faint);font-size:10px}
  footer :global(.attach-button){height:28px;padding:0 6px;font-size:11px;gap:5px}
  footer input[hidden]{display:none}
  .uploads{display:grid;gap:6px;padding:0 12px 10px}
  .upload{display:flex;align-items:center;gap:9px;padding:9px 10px;border-radius:7px;background:var(--surface-muted);color:var(--text-muted)}
  .upload-detail{display:grid;min-width:0;flex:1;gap:6px}
  .filename{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px}
  .upload-progress{height:3px;overflow:hidden;border-radius:2px;background:var(--border)}
  .upload-progress span{display:block;height:100%;border-radius:inherit;background:var(--brand)}
  .percent{font-size:11px;font-variant-numeric:tabular-nums}
  .upload-error,.attachment-error{color:var(--danger);font-size:12px;line-height:1.45}
  .attachment-error{margin:0;padding:0 14px 9px}
  .upload :global(.button){flex-shrink:0;width:28px;height:28px}
  @media(pointer:coarse){.modes :global(.mode.button),.tools :global(.button){min-width:40px;height:40px}}
</style>
