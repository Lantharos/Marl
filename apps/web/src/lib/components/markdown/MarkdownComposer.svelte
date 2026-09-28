<script lang="ts">
  import { onDestroy, tick } from 'svelte';
  import Bold from '@lucide/svelte/icons/bold';
  import Code from '@lucide/svelte/icons/code';
  import Italic from '@lucide/svelte/icons/italic';
  import Link from '@lucide/svelte/icons/link';
  import List from '@lucide/svelte/icons/list';
  import ListOrdered from '@lucide/svelte/icons/list-ordered';
  import Quote from '@lucide/svelte/icons/quote';
  import Paperclip from '@lucide/svelte/icons/paperclip';
  import FileImage from '@lucide/svelte/icons/file-image';
  import Film from '@lucide/svelte/icons/film';
  import RotateCw from '@lucide/svelte/icons/rotate-cw';
  import X from '@lucide/svelte/icons/x';
  import type { IconComponent } from '$lib/ui/icon';
  import Button from '../controls/Button.svelte';
  import Spinner from '../feedback/Spinner.svelte';
  import MarkdownBody from './MarkdownBody.svelte';
  import SavedReplyPicker from './SavedReplyPicker.svelte';
  import { page } from '$app/state';
  import { markdownPreview } from './markdown-preview';
  import type { MarkdownContext } from '$lib/markdown/context';
  import { mediaAccept, mediaFileError, MediaUploadQueue } from '$lib/media/uploads.svelte';

  let {
    value = $bindable(''),
    uploading = $bindable(false),
    placeholder = 'Leave a comment',
    minHeight = 120,
    compact = false,
    disabled = false,
    context,
    draftKey,
    onsubmit
  }: {
    value?: string;
    uploading?: boolean;
    placeholder?: string;
    minHeight?: number;
    compact?: boolean;
    disabled?: boolean;
    context?: MarkdownContext;
    draftKey?: string;
    onsubmit?: () => void;
  } = $props();
  let mode = $state<'write' | 'preview'>('write');
  const preview = $derived(mode === 'preview' && value.trim() ? markdownPreview(value, context) : null);
  let textarea = $state<HTMLTextAreaElement>();
  let picker = $state<HTMLInputElement>();
  let dragOver = $state(false);
  let repliesOpen = $state(false);
  let attachmentError = $state('');
  const uploads = new MediaUploadQueue(replaceUpload, (pending) => {
    uploading = pending;
  });
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
    const shift = (position: number) =>
      position <= offset
        ? position
        : position < offset + marker.length
          ? offset + replacement.length
          : position + replacement.length - marker.length;
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
    const start = textarea.selectionStart,
      end = textarea.selectionEnd;
    const selected = value.slice(start, end) || fallback;
    value = `${value.slice(0, start)}${before}${selected}${after}${value.slice(end)}`;
    requestAnimationFrame(() => {
      textarea?.focus();
      textarea?.setSelectionRange(start + before.length, start + before.length + selected.length);
    });
  }

  function keydown(event: KeyboardEvent) {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey) && onsubmit) {
      event.preventDefault();
      onsubmit();
    } else if (event.key === '.' && (event.metaKey || event.ctrlKey) && page.data.shellUser) {
      event.preventDefault();
      repliesOpen = true;
    }
  }

  function insert(text: string) {
    const start = textarea?.selectionStart ?? value.length;
    const end = textarea?.selectionEnd ?? value.length;
    value = `${value.slice(0, start)}${text}${value.slice(end)}`;
    mode = 'write';
    void tick().then(() => {
      textarea?.focus();
      textarea?.setSelectionRange(start + text.length, start + text.length);
    });
  }

  function line(prefix: string) {
    if (disabled || !textarea) return;
    const start = value.lastIndexOf('\n', textarea.selectionStart - 1) + 1;
    value = `${value.slice(0, start)}${prefix}${value.slice(start)}`;
    requestAnimationFrame(() => {
      textarea?.focus();
      textarea?.setSelectionRange(textarea.selectionStart + prefix.length, textarea.selectionEnd + prefix.length);
    });
  }
</script>

{#snippet tool(label: string, Icon: IconComponent, action: () => void)}
  <Button icon size="small" variant="ghost" aria-label={label} title={label} onclick={action}><Icon size={15} /></Button
  >
{/snippet}

<div
  class={[
    'min-w-0 overflow-hidden rounded-lg bg-surface shadow-surface transition-[outline-color] has-[textarea:focus]:outline has-[textarea:focus]:outline-brand',
    dragOver && 'outline-2 outline-offset-2 outline-brand'
  ]}
  role="group"
  aria-label="Markdown editor"
  {@attach rememberDraft(draftKey)}
  ondragover={drag}
  ondragleave={() => (dragOver = false)}
  ondrop={drop}
>
  <header class="flex min-h-11 flex-wrap items-center justify-between gap-x-3 bg-surface-muted px-1.5 py-1">
    <div class="flex items-center gap-0.5" role="tablist" aria-label="Editor mode">
      {#each [['write', 'Write'], ['preview', 'Preview']] as const as [option, label] (option)}
        <button
          type="button"
          role="tab"
          aria-selected={mode === option}
          class={[
            'h-8 rounded-md px-3 text-xs font-semibold transition-colors pointer-coarse:h-10',
            mode === option ? 'bg-surface text-ink-strong shadow-subtle' : 'text-ink-muted hover:text-ink-strong'
          ]}
          onclick={() => (mode = option)}>{label}</button
        >
      {/each}
    </div>
    {#if mode === 'write'}
      <fieldset
        class="m-0 flex min-w-0 flex-wrap items-center border-0 p-0 disabled:opacity-50"
        {disabled}
        aria-label="Text formatting"
      >
        {@render tool('Bold', Bold, () => wrap('**'))}
        {@render tool('Italic', Italic, () => wrap('_'))}
        {@render tool('Quote', Quote, () => line('> '))}
        {@render tool('Inline code', Code, () => wrap('`'))}
        {@render tool('Link', Link, () => wrap('[', '](https://)', 'label'))}
        {@render tool('Bulleted list', List, () => line('- '))}
        {@render tool('Numbered list', ListOrdered, () => line('1. '))}
        {#if page.data.shellUser}<SavedReplyPicker bind:open={repliesOpen} text={value} onInsert={insert} />{/if}
      </fieldset>
    {/if}
  </header>
  {#if mode === 'write'}
    <textarea
      bind:this={textarea}
      bind:value
      {placeholder}
      {disabled}
      aria-label={placeholder}
      onpaste={paste}
      onkeydown={keydown}
      class="block w-full resize-y bg-surface p-3.5 text-sm leading-relaxed text-ink outline-none placeholder:text-ink-faint disabled:cursor-not-allowed disabled:text-ink-muted"
      style:min-height={`${minHeight}px`}></textarea>
  {:else}
    <div class="p-3.5" style:min-height={`${minHeight}px`}>
      {#if preview}
        {#await preview}<span class="flex items-center gap-2 text-sm text-ink-muted"><Spinner />Rendering preview</span
          >{:then html}<MarkdownBody {html} />{:catch}<p class="text-sm text-danger">
            The preview could not be rendered.
          </p>{/await}
      {:else}<p class="text-sm text-ink-muted">Nothing to preview</p>{/if}
    </div>
  {/if}
  {#if uploads.entries.length}
    <div class="grid gap-1.5 px-3 pb-2.5" aria-label="Attachments">
      {#each uploads.entries as entry (entry.id)}
        <div class="flex items-center gap-2.5 rounded-md bg-surface-muted px-2.5 py-2 text-ink-muted">
          {#if entry.file.type.startsWith('video/')}<Film size={17} />{:else}<FileImage size={17} />{/if}
          <div class="grid min-w-0 flex-1 gap-1.5">
            <span class="truncate text-xs">{entry.file.name}</span>
            {#if entry.error}<span class="text-xs text-danger" role="alert">{entry.error}</span>{:else}<div
                class="h-0.75 overflow-hidden rounded-full bg-line"
                role="progressbar"
                aria-label={`Uploading ${entry.file.name}`}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={entry.progress}
              >
                <span class="block h-full rounded-full bg-brand transition-[width]" style:width={`${entry.progress}%`}
                ></span>
              </div>{/if}
          </div>
          {#if entry.status === 'failed'}<Button
              icon
              size="small"
              variant="ghost"
              aria-label={`Retry ${entry.file.name}`}
              onclick={() => uploads.retry(entry)}><RotateCw size={14} /></Button
            >{:else}<span class="text-xs tabular-nums"
              >{entry.status === 'queued' ? 'Queued' : `${entry.progress}%`}</span
            >{/if}
          <Button
            icon
            size="small"
            variant="ghost"
            aria-label={`Remove ${entry.file.name}`}
            onclick={() => uploads.remove(entry)}><X size={14} /></Button
          >
        </div>
      {/each}
    </div>
  {/if}
  {#if attachmentError}<p class="px-3.5 pb-2.5 text-xs text-danger" role="alert">{attachmentError}</p>{/if}
  {#if !compact || (context && !disabled)}
    <footer class="flex min-h-9 items-center gap-2.5 px-2 text-xs text-ink-faint">
      {#if context?.owner && context.repository && !disabled}
        <input
          bind:this={picker}
          type="file"
          accept={mediaAccept}
          multiple
          hidden
          onchange={(event) => {
            void attachFiles([...(event.currentTarget.files ?? [])]);
            event.currentTarget.value = '';
          }}
        />
        <Button size="small" variant="ghost" class="h-7 px-2" onclick={() => picker?.click()}
          ><Paperclip size={14} />Attach</Button
        >
      {/if}
      {#if !compact}<span>{context && !disabled ? 'Paste or drop images and videos' : 'Markdown supported'}</span>{/if}
    </footer>
  {/if}
</div>
