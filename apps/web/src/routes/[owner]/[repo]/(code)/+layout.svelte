<script lang="ts">
  import { onDestroy, onMount, untrack } from 'svelte';
  import { afterNavigate } from '$app/navigation';
  import { page } from '$app/state';
  import FolderTree from '@lucide/svelte/icons/folder-tree';
  import PanelLeftClose from '@lucide/svelte/icons/panel-left-close';
  import PanelLeftOpen from '@lucide/svelte/icons/panel-left-open';
  import X from '@lucide/svelte/icons/x';
  import Button from '#lib/components/controls/Button.svelte';
  import Tooltip from '#lib/components/overlays/Tooltip.svelte';
  import { forgetContent, parentFolder, rememberFolders } from '#lib/repositories/browser/content-cache.svelte.js';
  import FileFinder from '#lib/repositories/browser/FileFinder.svelte';
  import PathCrumbs from '#lib/repositories/browser/PathCrumbs.svelte';
  import { FileTree } from '#lib/repositories/browser/tree/file-tree.svelte.js';
  import { PaneLayout } from '#lib/repositories/browser/tree/pane-layout.svelte.js';
  import PaneResizer from '#lib/repositories/browser/tree/PaneResizer.svelte';
  import TreeDrawer from '#lib/repositories/browser/tree/TreeDrawer.svelte';
  import TreePane from '#lib/repositories/browser/tree/TreePane.svelte';
  import type { Folders } from '#lib/repositories/browser/types.js';
  import { plainKey } from '#lib/ui/keyboard.js';
  import type { LayoutProps } from './$types';

  let { data, params, children }: LayoutProps = $props();
  const owner = $derived(data.repository.owner);
  const repository = $derived(data.repository.name);
  const defaultBranch = $derived(data.repository.defaultBranch);
  const revision = $derived(params.revision ?? defaultBranch);
  const current = $derived(params.path ?? '');
  const file = $derived(Boolean(page.route.id?.includes('/blob/')));
  const openFolder = $derived(file ? parentFolder(current) : current);
  const folders = $derived((page.data.folders ?? {}) as Folders);
  const tree = $derived.by(() => {
    const location = { owner, repository, revision, defaultBranch };
    return untrack(() => new FileTree(location, () => folders, openFolder));
  });
  const pane = new PaneLayout();
  let drawerOpen = $state(false);
  let finderOpen = $state(false);

  $effect.pre(() => {
    const target = tree;
    const folder = openFolder;
    untrack(() => target.reveal(folder));
  });

  $effect(() => {
    const location = tree.location;
    const loaded = folders;
    untrack(() => rememberFolders(location, loaded));
  });

  onMount(() => pane.restore());
  onDestroy(forgetContent);
  afterNavigate(() => (drawerOpen = false));

  function openFinderShortcut(event: KeyboardEvent) {
    if (!data.branches.length || plainKey(event) !== 't' || finderOpen) return;
    event.preventDefault();
    finderOpen = true;
  }
</script>

<svelte:window onkeydown={openFinderShortcut} />

{#snippet paneButton(label: string, Icon: typeof PanelLeftOpen, onclick: () => void, className = '')}
  <Tooltip text={label} as="label">
    {#snippet children(tooltip)}
      <Button icon size="small" variant="ghost" class={className} {onclick} {...tooltip}><Icon size={16} /></Button>
    {/snippet}
  </Tooltip>
{/snippet}

{#if data.branches.length}
  <div class="flex items-start">
    {#if !pane.collapsed}
      <aside
        class="sticky top-17 flex max-h-[calc(100dvh-5.25rem)] shrink-0 flex-col surface max-lg:hidden"
        style:width="{pane.width}px"
        aria-label="Repository files"
      >
        <TreePane {tree} branches={data.branches} {current} onFind={() => (finderOpen = true)}>
          {#snippet action()}
            {@render paneButton('Hide files', PanelLeftClose, () => pane.setCollapsed(true))}
          {/snippet}
        </TreePane>
      </aside>
      <PaneResizer layout={pane} />
    {/if}
    <div class="min-w-0 flex-1">
      <div class="mb-4 flex min-h-8 items-center gap-2">
        {@render paneButton('Show files', FolderTree, () => (drawerOpen = true), 'lg:hidden')}
        {#if pane.collapsed}{@render paneButton(
            'Show files',
            PanelLeftOpen,
            () => pane.setCollapsed(false),
            'max-lg:hidden'
          )}{/if}
        <PathCrumbs location={tree.location} path={current} {file} />
      </div>
      {@render children()}
    </div>
  </div>
  <TreeDrawer bind:open={drawerOpen}>
    <TreePane {tree} branches={data.branches} {current} onFind={() => (finderOpen = true)}>
      {#snippet action()}
        {@render paneButton('Close files', X, () => (drawerOpen = false))}
      {/snippet}
    </TreePane>
  </TreeDrawer>
{:else}
  {@render children()}
{/if}

{#if finderOpen}<FileFinder
    location={tree.location}
    initial={tree.entries(openFolder) ?? []}
    onClose={() => (finderOpen = false)}
  />{/if}
