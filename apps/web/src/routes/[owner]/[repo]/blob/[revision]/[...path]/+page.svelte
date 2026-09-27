<script lang="ts">
  import CodeViewer from '$lib/code/CodeViewer.svelte';
  import { page } from '$app/state';
  import { onDestroy } from 'svelte';
  import Copy from '@lucide/svelte/icons/copy';
  import Check from '@lucide/svelte/icons/check';
  import Download from '@lucide/svelte/icons/download';
  import History from '@lucide/svelte/icons/rotate-ccw-clock';
  import Button from '$lib/components/controls/Button.svelte';
  import LinkButton from '$lib/components/controls/LinkButton.svelte';
  import Notice from '$lib/components/feedback/Notice.svelte';
  import { formatBytes } from '$lib/bytes';
  import Seo from '$lib/components/page/Seo.svelte';
  import PathCrumbs from '$lib/repositories/browser/PathCrumbs.svelte';
  import { encodeRepositoryPath, encodeRevision } from '$lib/repositories/repository-path';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
  const filePath = $derived(page.params.path ?? 'README.md');
  const revision = $derived(page.params.revision ?? 'main');
  const revisionPath = $derived(encodeRevision(revision));
  const content = $derived(data.preview.content);
  const rawUrl = $derived(
    `/api/v1/repositories/${page.params.owner}/${page.params.repo}/blob/${revisionPath}/${encodeRepositoryPath(filePath)}`
  );
  const lines = $derived(content.split('\n'));
  const base = $derived(`/${page.params.owner}/${page.params.repo}`);
  const sizeLabel = $derived(
    data.preview.binary
      ? formatBytes(data.preview.byteSize ?? 0)
      : `${lines.length.toLocaleString()}${data.preview.truncated ? '+' : ''} ${lines.length === 1 ? 'line' : 'lines'}`
  );
  const fileName = $derived(filePath.split('/').at(-1) ?? filePath);
  const previewable = $derived(
    data.preview.binary &&
      ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/avif'].includes(data.preview.contentType)
  );
  let copied = $state(false);
  let copiedTimer: ReturnType<typeof setTimeout> | undefined;
  async function copyFile() {
    await navigator.clipboard.writeText(content);
    copied = true;
    clearTimeout(copiedTimer);
    copiedTimer = setTimeout(() => (copied = false), 1400);
  }
  onDestroy(() => clearTimeout(copiedTimer));
</script>

<Seo
  title={`${filePath} · ${page.params.owner}/${page.params.repo} · Marl`}
  description={`View ${filePath} at ${revision} in ${page.params.owner}/${page.params.repo} on Marl.`}
  path={page.url.pathname}
  robots={data.repository.visibility === 'public' ? 'index, follow' : 'noindex, nofollow'}
/>
<PathCrumbs owner={page.params.owner ?? ''} repository={page.params.repo ?? ''} {revision} path={filePath} file />
<section class="overflow-hidden surface">
  <header
    class="flex min-h-12 items-center justify-between gap-3 border-b border-line-subtle bg-surface-muted/60 py-1.5 pr-2 pl-4"
  >
    <span class="flex min-w-0 items-baseline gap-2.5">
      <strong class="truncate text-sm font-semibold text-ink-strong">{fileName}</strong>
      <span class="text-xs whitespace-nowrap text-ink-muted tabular-nums max-sm:hidden">{sizeLabel}</span>
    </span>
    <span class="flex items-center gap-1">
      <LinkButton size="small" variant="ghost" href="{base}/commits/{revisionPath}"
        ><History size={14} /><span class="max-sm:hidden">History</span></LinkButton
      >
      {#if !data.preview.binary}<Button
          icon
          size="small"
          variant="ghost"
          aria-label={data.preview.truncated ? 'Copy preview' : 'Copy file'}
          onclick={copyFile}
          >{#if copied}<Check size={14} class="text-success" />{:else}<Copy size={14} />{/if}</Button
        >{/if}
      <LinkButton
        icon
        size="small"
        variant="ghost"
        href={rawUrl}
        download={fileName}
        aria-label="Download original file"><Download size={14} /></LinkButton
      >
    </span>
  </header>
  {#if data.preview.truncated}<Notice class="m-3"
      >Showing the first 1 MiB. Download the original file for the complete contents.</Notice
    >{/if}
  {#if data.preview.binary}
    <div class="grid justify-items-center gap-4 px-5 py-10 text-sm text-ink-muted">
      {#if previewable}<img class="max-h-[70vh] max-w-full rounded-lg" src={rawUrl} alt={filePath} />{:else}<p>
          This file has no text preview.
        </p>{/if}
      <LinkButton size="small" href={rawUrl} download={fileName}
        ><Download size={14} />Download original file</LinkButton
      >
    </div>
  {:else}{#key rawUrl}<CodeViewer {content} path={filePath} />{/key}{/if}
</section>
