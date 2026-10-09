<script lang="ts">
  import CircleAlert from '@lucide/svelte/icons/circle-alert';
  import Trash2 from '@lucide/svelte/icons/trash';
  import Upload from '@lucide/svelte/icons/upload';
  import Button from '#lib/components/controls/Button.svelte';
  import Notice from '#lib/components/feedback/Notice.svelte';
  import { formatBytes } from '#lib/bytes.js';
  import { assetIcon } from '../detail/asset-kind';
  import type { ReleaseUploads } from './release-uploads.svelte';

  let {
    uploads,
    disabled = false,
    onadd
  }: { uploads: ReleaseUploads; disabled?: boolean; onadd: (files: File[]) => void } = $props();
  let input = $state<HTMLInputElement>();
  let dragging = $state(false);

  function choose(event: Event) {
    const files = [...((event.currentTarget as HTMLInputElement).files ?? [])];
    if (input) input.value = '';
    onadd(files);
  }

  function drop(event: DragEvent) {
    event.preventDefault();
    dragging = false;
    if (!disabled) onadd([...(event.dataTransfer?.files ?? [])]);
  }
</script>

<section aria-labelledby="release-files">
  <header class="mb-2.5 flex items-baseline justify-between gap-3">
    <h2 id="release-files" class="text-sm font-semibold text-ink-strong">Files</h2>
    {#if uploads.items.length}<span class="text-xs text-ink-muted tabular-nums"
        >{uploads.items.length} {uploads.items.length === 1 ? 'file' : 'files'}</span
      >{/if}
  </header>
  {#if uploads.error}<Notice class="mb-2">{uploads.error}</Notice>{/if}
  <div
    role="group"
    aria-label="Release files"
    class={['rounded-xl p-1.5 transition-colors', dragging ? 'bg-brand-soft' : 'bg-surface-muted']}
    ondragover={(event) => {
      event.preventDefault();
      if (!disabled) dragging = true;
    }}
    ondragleave={(event) => {
      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) dragging = false;
    }}
    ondrop={drop}
  >
    {#if uploads.items.length}
      <div class="mb-1.5 grid gap-0.5">
        {#each uploads.items as item (item.key)}
          {@const Icon = assetIcon(item.name)}
          <div
            class="grid min-h-12 grid-cols-[16px_minmax(0,1fr)_auto] items-center gap-3 rounded-lg bg-surface px-3 py-2"
          >
            <Icon size={16} class={item.status === 'failed' ? 'text-danger' : 'text-ink-muted'} />
            <span class="min-w-0">
              <span class="block text-sm font-semibold break-all text-ink-strong">{item.name}</span>
              {#if item.status === 'uploading'}
                <span class="mt-1.5 flex items-center gap-2.5">
                  <span class="block h-1 flex-1 overflow-hidden rounded-full bg-surface-muted"
                    ><span
                      class="block h-full rounded-full bg-brand transition-[width] duration-300"
                      style:width="{item.progress * 100}%"
                    ></span></span
                  ><span class="text-xs text-ink-muted tabular-nums">{Math.round(item.progress * 100)}%</span>
                </span>
              {:else if item.status === 'failed'}
                <span class="mt-0.5 flex items-center gap-1 text-xs text-danger"
                  ><CircleAlert size={12} />{item.error}</span
                >
              {:else}
                <span class="mt-0.5 block text-xs text-ink-muted tabular-nums"
                  >{formatBytes(item.size)}{item.status === 'queued' ? ' · waiting to upload' : ''}</span
                >
              {/if}
            </span>
            {#if item.status !== 'uploading'}<Button
                icon
                size="small"
                variant="ghost"
                disabled={disabled || uploads.removing !== null}
                loading={uploads.removing === item.key}
                aria-label="Remove {item.name}"
                onclick={() => uploads.remove(item)}><Trash2 size={15} /></Button
              >{/if}
          </div>
        {/each}
      </div>
    {/if}
    <div class="flex flex-wrap items-center justify-center gap-x-3 gap-y-2 px-3 py-5 text-center">
      <span class="text-sm text-ink-muted">Drop binaries, archives, or checksums here</span>
      <Button size="small" {disabled} onclick={() => input?.click()}><Upload size={14} />Choose files</Button>
      <input bind:this={input} class="hidden" type="file" multiple onchange={choose} />
    </div>
  </div>
</section>
