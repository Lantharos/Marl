<script lang="ts">
  import type { ReleaseAsset } from '@marl/contracts';
  import Download from '@lucide/svelte/icons/download';
  import FileArchive from '@lucide/svelte/icons/file-archive';
  import ShieldCheck from '@lucide/svelte/icons/shield-check';
  import Button from '#lib/components/controls/Button.svelte';
  import SearchField from '#lib/components/controls/SearchField.svelte';
  import Notice from '#lib/components/feedback/Notice.svelte';
  import { formatBytes } from '#lib/bytes.js';
  import { countLabel } from '../release-state';
  import { assetIcon, isChecksumFile, parseChecksums } from './asset-kind';
  import ChecksumValue from './ChecksumValue.svelte';

  let { assets, archiveBase, commit }: { assets: ReleaseAsset[]; archiveBase: string; commit: string } = $props();
  let query = $state('');
  let checksums = $state<Map<string, string> | null>(null);
  let loadingChecksums = $state(false);
  let checksumError = $state('');
  const manifests = $derived(assets.filter((asset) => isChecksumFile(asset.name)));
  const shown = $derived(assets.filter((asset) => asset.name.toLowerCase().includes(query.trim().toLowerCase())));
  const downloads = $derived(assets.reduce((sum, asset) => sum + asset.downloadCount, 0));

  async function loadChecksums() {
    loadingChecksums = true;
    checksumError = '';
    try {
      const texts = await Promise.all(
        manifests.map(async (asset) => {
          const response = await fetch(asset.downloadUrl);
          if (!response.ok) throw new Error();
          return response.text();
        })
      );
      checksums = new Map(texts.flatMap((text) => [...parseChecksums(text)]));
    } catch {
      checksumError = 'Checksums could not be loaded.';
    } finally {
      loadingChecksums = false;
    }
  }
</script>

<section id="downloads" class="scroll-mt-24 surface p-1.5" aria-labelledby="downloads-title">
  <header class="flex items-baseline justify-between gap-3 px-3 pt-2.5 pb-2">
    <h2 id="downloads-title" class="text-base font-semibold text-ink-strong">Downloads</h2>
    {#if downloads}<span class="text-xs text-ink-muted tabular-nums">{countLabel(downloads, 'download')}</span>{/if}
  </header>
  {#if assets.length > 6}<SearchField label="Find a file" bind:value={query} class="mb-1.5" />{/if}
  <div class="grid gap-0.5">
    {#each shown as asset (asset.id)}
      {@const Icon = assetIcon(asset.name)}
      {@const sum = checksums?.get(asset.name)}
      <div class="group relative rounded-lg px-3 py-2.5 transition-colors hover:bg-surface-hover">
        <div class="grid grid-cols-[16px_minmax(0,1fr)_16px] items-start gap-2.5">
          <Icon size={16} class="mt-0.5 text-ink-muted" />
          <a href={asset.downloadUrl} class="min-w-0 after:absolute after:inset-0" download={asset.name}>
            <span class="block text-sm font-semibold break-all text-ink-strong group-hover:text-brand"
              >{asset.name}</span
            >
            <span class="mt-0.5 block text-xs text-ink-muted tabular-nums"
              >{formatBytes(asset.byteSize)} · {countLabel(asset.downloadCount, 'download')}</span
            >
          </a>
          <Download size={15} class="mt-0.5 text-ink-faint group-hover:text-brand" />
        </div>
        {#if sum}<ChecksumValue value={sum} />{/if}
      </div>
    {:else}
      <p class="px-3 py-3 text-sm text-ink-muted">
        {assets.length ? 'No matching files.' : 'No files were attached to this release.'}
      </p>
    {/each}
  </div>
  {#if manifests.length && !checksums}
    <div class="px-1.5 pt-1">
      <Button size="small" variant="ghost" loading={loadingChecksums} onclick={loadChecksums}
        ><ShieldCheck size={14} />Show checksums</Button
      >
    </div>
  {/if}
  {#if checksumError}<Notice class="m-1.5">{checksumError}</Notice>{/if}
  <div class="mt-1.5 border-t border-line-subtle pt-1.5">
    <p class="flex items-baseline justify-between gap-3 px-3 pt-1.5 pb-1 text-sm font-semibold text-ink-strong">
      Source code<code class="font-mono text-xs font-normal text-ink-muted">{commit.slice(0, 7)}</code>
    </p>
    <div class="grid grid-cols-2 gap-0.5">
      {#each [['zip', 'ZIP'], ['tar.gz', 'tar.gz']] as [format, label] (format)}
        <a
          class="group flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-semibold text-ink transition-colors hover:bg-surface-hover hover:text-brand"
          href="{archiveBase}/{format}"
          aria-label="Download source code as {label}"
          ><FileArchive size={16} class="text-ink-muted group-hover:text-brand" />{label}</a
        >
      {/each}
    </div>
  </div>
</section>
