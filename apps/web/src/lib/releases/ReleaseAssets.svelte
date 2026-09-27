<script lang="ts">
  import type { ReleaseAsset } from '@marl/contracts';
  import Download from '@lucide/svelte/icons/download';
  import FileArchive from '@lucide/svelte/icons/file-archive';
  import Trash2 from '@lucide/svelte/icons/trash';
  import Upload from '@lucide/svelte/icons/upload';
  import Button from '$lib/components/controls/Button.svelte';
  import LinkButton from '$lib/components/controls/LinkButton.svelte';
  import SearchField from '$lib/components/controls/SearchField.svelte';
  import Notice from '$lib/components/feedback/Notice.svelte';
  import { api, MarlApiError } from '$lib/api';
  import { formatBytes } from '$lib/bytes';
  import { uploadReleaseAsset } from './release-upload';

  let {
    owner,
    repository,
    releaseId,
    assets = $bindable(),
    editable = false
  }: { owner: string; repository: string; releaseId: string; assets: ReleaseAsset[]; editable?: boolean } = $props();
  let input = $state<HTMLInputElement>();
  let uploading = $state<Array<{ name: string; progress: number }>>([]);
  let deleting = $state<string | null>(null);
  let error = $state('');
  let query = $state('');
  const shown = $derived(assets.filter((asset) => asset.name.toLowerCase().includes(query.trim().toLowerCase())));

  async function chooseFiles(event: Event) {
    const files = [...((event.currentTarget as HTMLInputElement).files ?? [])];
    if (input) input.value = '';
    for (const file of files) await upload(file);
  }

  async function upload(file: File) {
    uploading = [...uploading, { name: file.name, progress: 0 }];
    error = '';
    try {
      const asset = await uploadReleaseAsset(
        owner,
        repository,
        releaseId,
        file,
        (progress) => (uploading = uploading.map((item) => (item.name === file.name ? { ...item, progress } : item)))
      );
      assets = [...assets, asset];
    } catch (cause) {
      error = cause instanceof MarlApiError ? cause.message : `Could not upload ${file.name}.`;
    } finally {
      uploading = uploading.filter((item) => item.name !== file.name);
    }
  }

  async function remove(asset: ReleaseAsset) {
    if (deleting) return;
    deleting = asset.id;
    error = '';
    try {
      await api(`/release-assets/${asset.id}`, { method: 'DELETE' });
      assets = assets.filter((item) => item.id !== asset.id);
    } catch (cause) {
      error = cause instanceof MarlApiError ? cause.message : 'The asset could not be deleted.';
    } finally {
      deleting = null;
    }
  }
</script>

<section class="min-w-0" id="downloads">
  <header class="mb-2 flex items-center justify-between gap-3">
    <h2 class="text-base font-semibold text-ink-strong">Downloads</h2>
    {#if editable}<Button size="small" disabled={uploading.length > 0} onclick={() => input?.click()}
        ><Upload size={14} />Add files</Button
      ><input bind:this={input} class="hidden" type="file" multiple onchange={chooseFiles} />{/if}
  </header>
  {#if error}<Notice class="mb-2">{error}</Notice>{/if}
  {#if assets.length > 6}<SearchField label="Find a file" bind:value={query} class="mb-2" />{/if}
  <div class="surface p-1.5">
    {#each shown as asset (asset.id)}
      <div
        class="group grid grid-cols-[18px_minmax(0,1fr)_auto_auto] items-center gap-2.5 rounded-lg py-1.5 pr-1.5 pl-3 transition-colors hover:bg-surface-hover"
      >
        <FileArchive size={16} class="text-ink-muted" />
        <a href={asset.downloadUrl} class="min-w-0 py-1">
          <strong class="block text-sm font-semibold break-all text-ink-strong group-hover:text-brand"
            >{asset.name}</strong
          >
          <span class="mt-0.5 block text-xs text-ink-muted"
            >{formatBytes(asset.byteSize)} · {asset.downloadCount}
            {asset.downloadCount === 1 ? 'download' : 'downloads'}</span
          >
        </a>
        <LinkButton icon size="small" variant="ghost" href={asset.downloadUrl} aria-label="Download {asset.name}"
          ><Download size={15} /></LinkButton
        >
        {#if editable}<Button
            icon
            size="small"
            variant="ghost"
            loading={deleting === asset.id}
            aria-label="Delete {asset.name}"
            onclick={() => remove(asset)}><Trash2 size={15} /></Button
          >{/if}
      </div>
    {/each}
    {#each uploading as item (item.name)}
      <div class="grid grid-cols-[18px_minmax(0,1fr)] items-center gap-2.5 px-3 py-2.5 text-ink-muted">
        <Upload size={15} />
        <span class="min-w-0">
          <span class="flex justify-between gap-3 text-sm"
            ><strong class="truncate font-semibold text-ink-strong">{item.name}</strong><span
              class="text-xs tabular-nums">{Math.round(item.progress * 100)}%</span
            ></span
          >
          <span class="mt-1.5 block h-1 overflow-hidden rounded-full bg-line"
            ><span class="block h-full rounded-full bg-brand transition-[width]" style:width={`${item.progress * 100}%`}
            ></span></span
          >
        </span>
      </div>
    {/each}
    {#if !assets.length && !uploading.length}<p class="px-3 py-4 text-sm text-ink-muted">No downloads attached.</p>{/if}
    {#if assets.length && !shown.length}<p class="px-3 py-4 text-sm text-ink-muted">No matching files.</p>{/if}
  </div>
</section>
