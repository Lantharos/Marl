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

<section class="assets">
  <header><div><h2>Assets</h2><p>Installers, binaries, checksums, and other files for this release.</p></div>{#if editable}<Button size="small" disabled={uploading.length > 0} onclick={() => input?.click()}><Upload size={13} />Add files</Button><input bind:this={input} type="file" multiple onchange={chooseFiles} />{/if}</header>
  {#if error}<p class="error" role="alert">{error}</p>{/if}
  <div class="rows">
    {#each assets as asset (asset.id)}<div class="asset"><FileArchive size={16} /><a href={asset.downloadUrl}><strong>{asset.name}</strong><small>{size(asset.byteSize)} · {asset.downloadCount} {asset.downloadCount === 1 ? 'download' : 'downloads'}</small></a><a class="download" href={asset.downloadUrl} aria-label="Download {asset.name}"><Download size={15} /></a>{#if editable}<Button icon size="small" variant="ghost" loading={deleting === asset.id} aria-label="Delete {asset.name}" onclick={() => remove(asset)}><Trash2 size={14} /></Button>{/if}</div>{/each}
    {#each uploading as item (item.name)}<div class="uploading"><Upload size={15} /><span><strong>{item.name}</strong><small>{Math.round(item.progress * 100)}%</small><i style={`--progress:${item.progress * 100}%`}></i></span></div>{/each}
    {#if !assets.length && !uploading.length}<p class="empty">No files attached.</p>{/if}
  </div>
</section>

<style>
  .assets{padding-top:24px;border-top:1px solid var(--border-subtle)}header{display:flex;align-items:flex-start;justify-content:space-between;gap:18px}h2{margin:0;color:var(--text-strong);font-size:16px}header p{margin:5px 0 0;color:var(--text-faint);font-size:11px}input[type=file]{display:none}.error{margin:14px 0 0;color:var(--danger);font-size:11px}.rows{margin-top:16px;border-top:1px solid var(--border-subtle)}.asset,.uploading{display:flex;min-height:54px;align-items:center;gap:10px;border-bottom:1px solid var(--border-subtle);color:var(--text-faint)}.asset>a:not(.download),.uploading span{min-width:0;flex:1;text-decoration:none}.asset strong,.asset small,.uploading strong,.uploading small{display:block}.asset strong,.uploading strong{overflow:hidden;color:var(--text-strong);font-size:11px;text-overflow:ellipsis;white-space:nowrap}.asset small,.uploading small{margin-top:3px;color:var(--text-faint);font-size:11px}.download{display:grid;width:30px;height:30px;color:var(--text-muted);place-items:center}.download:hover{color:var(--brand)}.uploading span{position:relative;padding:8px 0}.uploading i{position:absolute;right:0;bottom:0;left:0;height:2px;background:linear-gradient(to right,var(--brand) var(--progress),var(--border-subtle) var(--progress))}.empty{margin:0;padding:22px 0;color:var(--text-faint);font-size:11px}
</style>
