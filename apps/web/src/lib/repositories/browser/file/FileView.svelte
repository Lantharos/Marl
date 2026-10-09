<script lang="ts">
  import { onDestroy } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import Check from '@lucide/svelte/icons/check';
  import Code from '@lucide/svelte/icons/code-xml';
  import Copy from '@lucide/svelte/icons/copy';
  import Download from '@lucide/svelte/icons/download';
  import Eye from '@lucide/svelte/icons/eye';
  import CodeViewer from '#lib/code/CodeViewer.svelte';
  import type { SourcePreview } from '#lib/code/types.js';
  import { formatBytes } from '#lib/bytes.js';
  import Button from '#lib/components/controls/Button.svelte';
  import LinkButton from '#lib/components/controls/LinkButton.svelte';
  import SegmentedControl from '#lib/components/controls/SegmentedControl.svelte';
  import Notice from '#lib/components/feedback/Notice.svelte';
  import MarkdownBody from '#lib/components/markdown/MarkdownBody.svelte';
  import Tooltip from '#lib/components/overlays/Tooltip.svelte';
  import { encodeRepositoryPath, encodeRevision } from '../../repository-path';
  import type { CodeLocation } from '../entry-path';
  import type { RenderedDocument, TreeEntry } from '../types';
  import FileCommit from './FileCommit.svelte';
  import { isMarkdown, isPreviewableImage } from './file-kind';

  let {
    location,
    path,
    preview,
    rendered,
    entry
  }: {
    location: CodeLocation;
    path: string;
    preview: SourcePreview;
    rendered: RenderedDocument | null;
    entry?: TreeEntry;
  } = $props();
  const base = $derived(`/${location.owner}/${location.repository}`);
  const rawUrl = $derived(
    `/api/v1/repositories${base}/blob/${encodeRevision(location.revision)}/${encodeRepositoryPath(path)}`
  );
  const fileName = $derived(path.split('/').at(-1) ?? path);
  const lineCount = $derived(preview.binary ? 0 : preview.content.split('\n').length);
  const sizeLabel = $derived(
    preview.binary
      ? formatBytes(preview.byteSize ?? 0)
      : `${lineCount.toLocaleString()}${preview.truncated ? '+' : ''} ${lineCount === 1 ? 'line' : 'lines'}`
  );
  const mode = $derived(rendered ? 'rendered' : 'source');
  const markdownModes = [
    { value: 'rendered', label: 'Rendered', icon: Eye },
    { value: 'source', label: 'Source', icon: Code }
  ] as const;
  let copied = $state(false);
  let copiedTimer: ReturnType<typeof setTimeout> | undefined;

  async function copyFile() {
    await navigator.clipboard.writeText(preview.content);
    copied = true;
    clearTimeout(copiedTimer);
    copiedTimer = setTimeout(() => (copied = false), 1400);
  }

  function showMode(next: 'rendered' | 'source') {
    const url = new URL(page.url.href);
    url.hash = '';
    if (next === 'source') url.searchParams.set('plain', '1');
    else url.searchParams.delete('plain');
    void goto(url, { reset: false });
  }

  onDestroy(() => clearTimeout(copiedTimer));
</script>

<section class="overflow-hidden surface">
  <header class="border-b border-line-subtle bg-surface-muted/60">
    <FileCommit {entry} {base} historyHref="{base}/commits/{encodeRevision(location.revision)}" />
  </header>
  <div
    class="flex min-h-12 flex-wrap items-center justify-between gap-x-3 gap-y-1.5 border-b border-line-subtle py-1.5 pr-2 pl-4"
  >
    <span class="flex min-w-0 items-baseline gap-2.5">
      <strong class="truncate text-sm font-semibold text-ink-strong">{fileName}</strong>
      <span class="text-xs whitespace-nowrap text-ink-muted tabular-nums">{sizeLabel}</span>
    </span>
    <span class="flex items-center gap-1">
      {#if isMarkdown(path)}<SegmentedControl
          class="mr-1"
          label="File view"
          value={mode}
          options={markdownModes}
          onchange={showMode}
        />{/if}
      <LinkButton size="small" variant="ghost" href={rawUrl} target="_blank" rel="external noopener">Raw</LinkButton>
      {#if !preview.binary}<Tooltip
          text={copied ? 'Copied' : preview.truncated ? 'Copy preview' : 'Copy file'}
          as="label"
        >
          {#snippet children(tooltip)}
            <Button icon size="small" variant="ghost" onclick={copyFile} {...tooltip}
              >{#if copied}<Check size={14} class="text-success" />{:else}<Copy size={14} />{/if}</Button
            >
          {/snippet}
        </Tooltip>{/if}
      <Tooltip text="Download" as="label">
        {#snippet children(tooltip)}
          <LinkButton icon size="small" variant="ghost" href={rawUrl} download={fileName} {...tooltip}
            ><Download size={14} /></LinkButton
          >
        {/snippet}
      </Tooltip>
    </span>
  </div>
  {#if preview.truncated && mode === 'source'}<Notice class="m-3"
      >Showing the first 1 MiB. Download the original file for the complete contents.</Notice
    >{/if}
  {#if preview.binary}
    <div class="grid justify-items-center gap-4 px-5 py-10 text-sm text-ink-muted">
      {#if isPreviewableImage(preview.contentType)}<img
          class="max-h-[70vh] max-w-full rounded-lg"
          src={rawUrl}
          alt={path}
        />{:else}<p>This file has no text preview.</p>{/if}
      <LinkButton size="small" href={rawUrl} download={fileName}
        ><Download size={14} />Download original file</LinkButton
      >
    </div>
  {:else if rendered}
    <div class="px-5 py-6 sm:px-8 sm:py-8"><MarkdownBody html={rendered.html} variant="document" /></div>
  {:else}{#key rawUrl}<CodeViewer content={preview.content} {path} />{/key}{/if}
</section>
