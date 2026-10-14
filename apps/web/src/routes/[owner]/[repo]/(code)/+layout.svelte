<script lang="ts">
  import { onMount } from 'svelte';
  import { afterNavigate } from '$app/navigation';
  import FolderTree from '@lucide/svelte/icons/folder-tree';
  import PanelLeftClose from '@lucide/svelte/icons/panel-left-close';
  import PanelLeftOpen from '@lucide/svelte/icons/panel-left-open';
  import X from '@lucide/svelte/icons/x';
  import Button from '#lib/components/controls/Button.svelte';
  import Tooltip from '#lib/components/overlays/Tooltip.svelte';
  import FileFinder from '#lib/repositories/browser/FileFinder.svelte';
  import { CodeBrowser } from '#lib/repositories/browser/tree/code-browser.svelte.js';
  import { PaneLayout } from '#lib/repositories/browser/tree/pane-layout.svelte.js';
  import PaneResizer from '#lib/repositories/browser/tree/PaneResizer.svelte';
  import TreeDrawer from '#lib/repositories/browser/tree/TreeDrawer.svelte';
  import TreePane from '#lib/repositories/browser/tree/TreePane.svelte';
  import { plainKey } from '#lib/ui/keyboard.js';
  import type { LayoutProps } from './$types';

  let { data, children }: LayoutProps = $props();
  const code = new CodeBrowser(() => data.repository);
  const tree = $derived(code.tree);
  const current = $derived(code.current);
  const pane = new PaneLayout();
  let drawerOpen = $state(false);
  let finderOpen = $state(false);

  onMount(() => pane.restore());
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
      <div class={['mb-3 flex items-center gap-2', !pane.collapsed && 'lg:hidden']}>
        {@render paneButton('Show files', FolderTree, () => (drawerOpen = true), 'lg:hidden')}
        {#if pane.collapsed}{@render paneButton(
            'Show files',
            PanelLeftOpen,
            () => pane.setCollapsed(false),
            'max-lg:hidden'
          )}{/if}
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
    initial={tree.entries(code.openFolder) ?? []}
    onClose={() => (finderOpen = false)}
  />{/if}
