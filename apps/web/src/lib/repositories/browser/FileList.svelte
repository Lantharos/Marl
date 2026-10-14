<script lang="ts">
  import type { Snippet } from 'svelte';
  import CornerLeftUp from '@lucide/svelte/icons/corner-left-up';
  import File from '@lucide/svelte/icons/file';
  import Folder from '@lucide/svelte/icons/folder';
  import Time from '#lib/components/page/Time.svelte';
  import { entryHref, repositoryLinks, type CodeLinks, type CodeLocation } from './entry-path';
  import type { TreeEntry } from './types';

  let {
    location,
    entries,
    parentPath,
    empty = 'This folder is empty.',
    links = repositoryLinks,
    header
  }: {
    location: CodeLocation;
    entries: TreeEntry[];
    parentPath?: string;
    empty?: string;
    links?: CodeLinks;
    header?: Snippet;
  } = $props();
  const rowClass =
    'grid min-h-11 grid-cols-[minmax(0,1fr)_auto] items-center gap-4 px-4 text-sm transition-colors hover:bg-surface-hover sm:grid-cols-[minmax(160px,280px)_minmax(0,1fr)_auto]';
</script>

<section class="overflow-hidden surface" aria-label="Files" data-sveltekit-preload-data="hover">
  {#if header}<header
      class="flex min-h-13 flex-wrap items-center gap-x-3 gap-y-1 border-b border-line-subtle bg-surface-muted/60 px-4 py-2"
    >
      {@render header()}
    </header>{/if}
  <div class="divide-y divide-line-subtle">
    {#if parentPath !== undefined}
      <a class={rowClass} href={entryHref(location, 'tree', parentPath, links)}
        ><span class="flex items-center gap-2.5 text-ink-muted"><CornerLeftUp size={15} />..</span></a
      >
    {/if}
    {#each entries as entry (entry.path)}
      <a class={[rowClass, 'group']} href={entryHref(location, entry.kind, entry.path, links)}>
        <span class="flex min-w-0 items-center gap-2.5">
          {#if entry.kind === 'tree'}<Folder size={16} class="shrink-0 fill-current text-brand" />{:else}<File
              size={16}
              class="shrink-0 text-ink-muted"
            />{/if}
          <span class="truncate font-medium text-ink-strong group-hover:text-brand">{entry.name}</span>
        </span>
        <span class="truncate text-ink-muted max-sm:hidden">{entry.message ?? ''}</span>
        {#if entry.updatedAt}<Time
            value={entry.updatedAt}
            class="text-xs whitespace-nowrap text-ink-muted"
          />{:else}<span></span>{/if}
      </a>
    {:else}
      <p class="px-4 py-10 text-center text-sm text-ink-muted">{empty}</p>
    {/each}
  </div>
</section>
