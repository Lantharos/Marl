<script lang="ts">
  import type { ReleaseAsset } from '@marl/contracts';
  import Download from 'lucide-svelte/icons/download';
  import FileArchive from 'lucide-svelte/icons/file-archive';
  import Trash2 from 'lucide-svelte/icons/trash-2';
  import Upload from 'lucide-svelte/icons/upload';
  import Button from '$lib/components/Button.svelte';
  import { api, MarlApiError } from '$lib/api';
  import { uploadReleaseAsset } from './release-upload';

  let { owner, repository, releaseId, assets = $bindable(), editable = false }: { owner: string; repository: string; releaseId: string; assets: ReleaseAsset[]; editable?: boolean } = $props();
  let input = $state<HTMLInputElement>();
  let uploading = $state<Array<{ name: string; progress: number }>>([]);
  let deleting = $state<string | null>(null);
  let error = $state('');
  let query = $state('');
  const shown = $derived(assets.filter(asset => asset.name.toLowerCase().includes(query.trim().toLowerCase())));

  async function chooseFiles(event: Event) {
    const files = [...((event.currentTarget as HTMLInputElement).files ?? [])];
    if (input) input.value = '';
    for (const file of files) await upload(file);
  }

  async function upload(file: File) {
    uploading = [...uploading, { name: file.name, progress: 0 }];
    error = '';
    try {
      const asset = await uploadReleaseAsset(owner, repository, releaseId, file, (progress) => (uploading = uploading.map((item) => item.name === file.name ? { ...item, progress } : item)));
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

  function size(bytes: number) {
    if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
    if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
    if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${bytes} B`;
  }
</script>

<section class="assets" id="downloads">
  <header><div><h2>Downloads</h2></div>{#if editable}<Button size="small" disabled={uploading.length > 0} onclick={() => input?.click()}><Upload size={13} />Add files</Button><input bind:this={input} type="file" multiple onchange={chooseFiles} />{/if}</header>
  {#if error}<p class="error" role="alert">{error}</p>{/if}
  {#if assets.length > 6}<input class="search" aria-label="Find a download" placeholder="Find a file" bind:value={query} />{/if}
  <div class="rows">
    {#each shown as asset (asset.id)}<div class="asset"><FileArchive size={16} /><a href={asset.downloadUrl}><strong>{asset.name}</strong><small>{size(asset.byteSize)} · {asset.downloadCount} {asset.downloadCount === 1 ? 'download' : 'downloads'}</small></a><a class="download" href={asset.downloadUrl} aria-label="Download {asset.name}"><Download size={15} /></a>{#if editable}<Button icon size="small" variant="ghost" loading={deleting === asset.id} aria-label="Delete {asset.name}" onclick={() => remove(asset)}><Trash2 size={14} /></Button>{/if}</div>{/each}
    {#each uploading as item (item.name)}<div class="uploading"><Upload size={15} /><span><strong>{item.name}</strong><small>{Math.round(item.progress * 100)}%</small><i style={`--progress:${item.progress * 100}%`}></i></span></div>{/each}
    {#if !assets.length && !uploading.length}<p class="empty">No downloads attached.</p>{/if}
    {#if assets.length && !shown.length}<p class="empty">No matching files.</p>{/if}
  </div>
</section>

<style>
 .assets{padding:20px;border-radius:14px;background:var(--surface);box-shadow:var(--shadow-surface);scroll-margin-top:80px}header{display:flex;align-items:center;justify-content:space-between;gap:12px}h2{margin:0;color:var(--text-strong);font-size:15px}input[type=file]{display:none}.search{width:100%;box-sizing:border-box;margin-top:16px;padding:10px 12px;border:1px solid var(--border);border-radius:9px;background:var(--canvas);color:var(--text);font:inherit;font-size:13px}.error{color:var(--danger);font-size:13px}.rows{display:grid;gap:6px;margin-top:14px}.asset,.uploading{display:flex;align-items:center;gap:10px;padding:12px 8px;border-radius:9px;color:var(--text-muted)}.asset:hover{background:var(--surface-hover)}.asset>a:not(.download),.uploading span{min-width:0;flex:1;text-decoration:none}.asset> :global(svg){flex:none}.asset strong,.asset small,.uploading strong,.uploading small{display:block}.asset strong,.uploading strong{color:var(--text-strong);font-size:13px;overflow-wrap:anywhere;line-height:1.5}.asset small,.uploading small{margin-top:5px;color:var(--text-muted);font-size:11px;line-height:1.5}.download{display:grid;width:32px;height:32px;flex:none;place-items:center;border-radius:8px;background:var(--surface-muted);color:var(--text)}.download:hover{color:var(--brand)}.uploading span{position:relative;padding-bottom:8px}.uploading i{position:absolute;left:0;bottom:0;height:2px;width:var(--progress);background:var(--brand)}.empty{margin:0;padding:12px 8px;color:var(--text-muted);font-size:13px}
</style>
