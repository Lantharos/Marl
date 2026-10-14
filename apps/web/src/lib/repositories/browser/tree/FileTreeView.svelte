<script lang="ts">
  import { untrack } from 'svelte';
  import { afterNavigate, preloadData } from '$app/navigation';
  import ChevronRight from '@lucide/svelte/icons/chevron-right';
  import File from '@lucide/svelte/icons/file';
  import Folder from '@lucide/svelte/icons/folder';
  import FolderOpen from '@lucide/svelte/icons/folder-open';
  import Spinner from '#lib/components/feedback/Spinner.svelte';
  import { parentFolder } from '../content-cache.svelte';
  import { entryHref, repositoryLinks, type CodeLinks } from '../entry-path';
  import type { TreeEntry } from '../types';
  import type { FileTree, TreeRow } from './file-tree.svelte';

  let { tree, current, links = repositoryLinks }: { tree: FileTree; current: string; links?: CodeLinks } = $props();
  const id = $props.id();
  const rowHeight = 30;
  const overscan = 10;
  let viewport = $state<HTMLDivElement>();
  let scrollTop = $state(0);
  let height = $state(900);
  let activePath = $state<string | null>(null);
  let typed = '';
  let typedAt = 0;
  let intent: ReturnType<typeof setTimeout> | undefined;
  let restoreFocus = false;
  let focusingByPointer = false;
  let focused = $state(false);
  let keyboard = $state(false);
  const rows = $derived(tree.rows);
  const start = $derived(Math.max(0, Math.floor(scrollTop / rowHeight) - overscan));
  const end = $derived(Math.min(rows.length, Math.ceil((scrollTop + height) / rowHeight) + overscan));
  const activeIndex = $derived(rows.findIndex((row) => row.key === (activePath ?? current)));

  const href = (entry: TreeEntry) => entryHref(tree.location, entry.kind, entry.path, links);
  const entryAt = (index: number) => {
    const row = rows[index];
    return row?.kind === 'entry' ? row : undefined;
  };

  $effect(() => {
    const path = current;
    untrack(() => {
      activePath = null;
      reveal(
        rows.findIndex((row) => row.key === path),
        'center'
      );
    });
  });

  afterNavigate(() => {
    if (restoreFocus) focusTree();
    restoreFocus = false;
  });

  function reveal(index: number, align: 'nearest' | 'center') {
    if (!viewport || index < 0) return;
    const top = index * rowHeight;
    const visible = viewport.clientHeight;
    if (align === 'center' && (top < viewport.scrollTop || top + rowHeight > viewport.scrollTop + visible))
      viewport.scrollTop = top - (visible - rowHeight) / 2;
    else if (top < viewport.scrollTop) viewport.scrollTop = top;
    else if (top + rowHeight > viewport.scrollTop + visible) viewport.scrollTop = top + rowHeight - visible;
  }

  function prefetch(entry: TreeEntry) {
    clearTimeout(intent);
    intent = setTimeout(() => void preloadData(href(entry)).catch(() => {}), 90);
  }

  function nearestEntry(index: number, step: 1 | -1) {
    const clamped = Math.max(0, Math.min(rows.length - 1, index));
    for (let target = clamped; target >= 0 && target < rows.length; target += step) if (entryAt(target)) return target;
    for (let target = clamped; target >= 0 && target < rows.length; target -= step) if (entryAt(target)) return target;
    return -1;
  }

  function activate(index: number) {
    const target = nearestEntry(index, index >= activeIndex ? 1 : -1);
    const row = entryAt(target);
    if (!row) return;
    activePath = row.key;
    reveal(target, 'nearest');
    prefetch(row.entry);
  }

  function findTyped(key: string) {
    const now = performance.now();
    typed = now - typedAt > 600 ? key.toLowerCase() : typed + key.toLowerCase();
    typedAt = now;
    const from = typed.length === 1 ? activeIndex + 1 : Math.max(activeIndex, 0);
    for (let offset = 0; offset < rows.length; offset++) {
      const index = (from + offset) % rows.length;
      const row = entryAt(index);
      if (row?.entry.name.toLowerCase().startsWith(typed)) return activate(index);
    }
  }

  function keydown(event: KeyboardEvent) {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    const index = activeIndex < 0 ? 0 : activeIndex;
    const row = entryAt(index);
    const folder = row?.entry.kind === 'tree';
    if (event.key === 'ArrowDown') activate(activeIndex < 0 ? 0 : index + 1);
    else if (event.key === 'ArrowUp') activate(index - 1);
    else if (event.key === 'Home') activate(0);
    else if (event.key === 'End') activate(rows.length - 1);
    else if (event.key === 'ArrowRight' && row && folder) {
      if (!row.expanded) tree.expand(row.entry.path);
      else if (tree.failed.has(row.entry.path)) tree.load(row.entry.path);
      else if (rows[index + 1]?.kind === 'entry' && rows[index + 1].depth > row.depth) activate(index + 1);
    } else if (event.key === 'ArrowLeft' && row) {
      if (row.expanded) tree.collapse(row.entry.path);
      else activate(rows.findIndex((candidate) => candidate.key === parentFolder(row.key)));
    } else if (event.key === 'Enter' && row) document.getElementById(`${id}-${index}`)?.click();
    else if (event.key === ' ' && row && folder) tree.toggle(row.entry.path);
    else if (/^[\p{L}\p{N}._-]$/u.test(event.key)) findTyped(event.key);
    else return;
    event.preventDefault();
    keyboard = true;
  }

  function focusTree() {
    focusingByPointer = !keyboard;
    viewport?.focus({ preventScroll: true });
    focusingByPointer = false;
  }

  function enter() {
    focused = true;
    if (focusingByPointer || !viewport?.matches(':focus-visible')) return;
    keyboard = true;
    if (activeIndex < 0) activate(0);
  }

  function choose(event: MouseEvent, row: Extract<TreeRow, { kind: 'entry' }>) {
    activePath = row.key;
    keyboard = event.detail === 0;
    focusTree();
    if (event.metaKey || event.ctrlKey || event.shiftKey) return;
    const toggles =
      row.entry.kind === 'tree' &&
      (row.entry.path === current || (event.target as Element).closest('[data-toggle]') !== null);
    if (!toggles) {
      restoreFocus = true;
      return;
    }
    event.preventDefault();
    tree.toggle(row.entry.path);
  }
</script>

<div
  bind:this={viewport}
  bind:clientHeight={height}
  onscroll={() => (scrollTop = viewport?.scrollTop ?? 0)}
  onkeydown={keydown}
  onfocusin={enter}
  onfocusout={() => (focused = false)}
  onpointerdown={() => (keyboard = false)}
  role="tree"
  tabindex="0"
  aria-label="Files"
  aria-activedescendant={activeIndex >= start && activeIndex < end ? `${id}-${activeIndex}` : undefined}
  class="min-h-0 flex-1 overflow-y-auto overscroll-contain rounded-lg outline-none"
>
  <div role="none" class="relative" style:height="{rows.length * rowHeight}px">
    <div role="none" style:padding-top="{start * rowHeight}px">
      {#each rows.slice(start, end) as row, offset (row.key)}
        {@const index = start + offset}
        {@const indent = `${8 + row.depth * 14}px`}
        {#if row.kind === 'entry'}
          {@const selected = row.entry.path === current}
          <a
            id="{id}-{index}"
            role="treeitem"
            tabindex="-1"
            aria-level={row.depth + 1}
            aria-selected={selected}
            aria-expanded={row.entry.kind === 'tree' ? row.expanded : undefined}
            aria-current={selected ? 'page' : undefined}
            href={href(row.entry)}
            onmousedown={(event) => event.preventDefault()}
            onclick={(event) => choose(event, row)}
            onpointerenter={() => prefetch(row.entry)}
            onpointerleave={() => clearTimeout(intent)}
            style:padding-left={indent}
            class={[
              'flex h-7.5 items-center gap-1.5 rounded-md pr-2 text-sm transition-colors select-none',
              selected ? 'bg-surface-muted font-medium text-ink-strong' : 'text-ink hover:bg-surface-hover',
              index === activeIndex && focused && keyboard && 'ring-2 ring-brand'
            ]}
          >
            {#if row.entry.kind === 'tree'}
              <span data-toggle class="-my-1 grid size-5 shrink-0 place-items-center rounded-sm text-ink-faint">
                <ChevronRight size={14} class={['transition-transform duration-150', row.expanded && 'rotate-90']} />
              </span>
              {#if row.expanded}<FolderOpen size={15} class="shrink-0 text-brand" />{:else}<Folder
                  size={15}
                  class="shrink-0 fill-current text-brand"
                />{/if}
            {:else}
              <span class="size-5 shrink-0"></span>
              <File size={15} class={['shrink-0', selected ? 'text-brand' : 'text-ink-faint']} />
            {/if}
            <span class="truncate">{row.entry.name}</span>
          </a>
        {:else}
          <div
            role="none"
            class="flex h-7.5 items-center gap-2 pr-2 text-xs text-ink-muted"
            style:padding-left="calc({indent} + 26px)"
          >
            {#if row.failed}Couldn't load this folder.<button
                type="button"
                class="font-medium text-brand hover:underline"
                onclick={() => tree.load(row.path)}>Retry</button
              >{:else}<Spinner />Loading{/if}
          </div>
        {/if}
      {/each}
    </div>
  </div>
</div>
