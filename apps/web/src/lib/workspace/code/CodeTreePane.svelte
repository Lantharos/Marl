<script lang="ts">
  import Search from '@lucide/svelte/icons/search';
  import Button from '#lib/components/controls/Button.svelte';
  import Tooltip from '#lib/components/overlays/Tooltip.svelte';
  import type { FileTree } from '#lib/repositories/browser/tree/file-tree.svelte.js';
  import FileTreeView from '#lib/repositories/browser/tree/FileTreeView.svelte';
  import type { PaneLayout } from '#lib/repositories/browser/tree/pane-layout.svelte.js';
  import PaneResizer from '#lib/repositories/browser/tree/PaneResizer.svelte';
  import { workspaceLinks } from './code-repository';

  let { tree, current, layout, onFind }: { tree: FileTree; current: string; layout: PaneLayout; onFind: () => void } =
    $props();
  const location = $derived(tree.location);
</script>

<div class="flex h-full flex-col">
  <header class="flex h-12 shrink-0 items-center gap-2 pr-2 pl-4">
    <a
      class="min-w-0 truncate text-md font-semibold text-ink-strong hover:text-brand"
      href={workspaceLinks.tree({ ...location, revision: location.defaultBranch })}>{location.repository}</a
    >
    {#if location.revision !== location.defaultBranch}<span class="min-w-0 truncate font-mono text-xs text-ink-muted"
        >{location.revision}</span
      >{/if}
    <Tooltip text="Go to file T" placement="bottom-end" as="label">
      {#snippet children(tooltip)}
        <Button {...tooltip} class="ml-auto" icon size="small" variant="ghost" onclick={onFind}
          ><Search size={15} /></Button
        >
      {/snippet}
    </Tooltip>
  </header>
  <div class="flex min-h-0 flex-1 flex-col px-2 pb-2">
    <FileTreeView {tree} {current} links={workspaceLinks} />
  </div>
</div>
<PaneResizer {layout} class="absolute inset-y-0 -right-2 z-10 max-md:hidden" />
