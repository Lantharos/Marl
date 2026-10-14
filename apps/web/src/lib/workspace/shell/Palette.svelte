<script lang="ts">
  import { tick } from 'svelte';
  import { page } from '$app/state';
  import type { RepositorySummary } from '@marl/contracts';
  import Search from '@lucide/svelte/icons/search';
  import { api } from '#lib/api.js';
  import Spinner from '#lib/components/feedback/Spinner.svelte';
  import Kbd from '#lib/components/page/Kbd.svelte';
  import { popoverMotion } from '#lib/ui/popover.js';
  import { currentRepository } from '../store/refs';
  import { actionEntries, destinationEntries, matchEntries, resultEntries, type PaletteEntry } from './palette-entries';
  import { shell } from './shell-state.svelte';

  let { repositories, onClose }: { repositories: RepositorySummary[]; onClose: () => void } = $props();
  let input = $state<HTMLInputElement>();
  let list = $state<HTMLElement>();
  let query = $state('');
  let remote = $state.raw<PaletteEntry[]>([]);
  let loading = $state(false);
  let selected = $state(0);
  const local = $derived([
    ...actionEntries(shell.actions),
    ...destinationEntries(repositories, currentRepository(page.url))
  ]);
  const results = $derived([...matchEntries(local, query), ...remote]);

  $effect(() => {
    const value = query.trim();
    remote = [];
    loading = value.length >= 2;
    if (value.length < 2) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const response = await api<{ results: Parameters<typeof resultEntries>[0] }>(
          `/search?q=${encodeURIComponent(value)}`,
          { signal: controller.signal }
        );
        remote = resultEntries(response.results);
      } catch {
        remote = [];
      } finally {
        if (!controller.signal.aborted) loading = false;
      }
    }, 120);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  });

  function show(dialog: HTMLDialogElement) {
    const returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialog.showModal();
    input?.focus();
    return () => {
      dialog.close();
      if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
    };
  }

  function run(entry: PaletteEntry) {
    onClose();
    void entry.run();
  }

  async function keydown(event: KeyboardEvent) {
    if (!results.length) return;
    const moves: Record<string, number> = {
      ArrowDown: (selected + 1) % results.length,
      ArrowUp: (selected - 1 + results.length) % results.length,
      Home: 0,
      End: results.length - 1
    };
    if (event.key in moves) {
      event.preventDefault();
      selected = moves[event.key];
    } else if (event.key === 'Enter' && results[selected]) {
      event.preventDefault();
      run(results[selected]);
      return;
    } else return;
    await tick();
    list?.querySelector(`[data-entry="${selected}"]`)?.scrollIntoView({ block: 'nearest' });
  }
</script>

<dialog
  {@attach show}
  class="fixed inset-0 m-0 size-full max-h-none max-w-none items-start justify-center bg-transparent px-3 pt-[12dvh] pb-6 text-ink backdrop:bg-black/45 open:flex"
  aria-label="Command palette"
  oncancel={(event) => {
    event.preventDefault();
    onClose();
  }}
  onkeydown={keydown}
  onclick={(event) => event.currentTarget === event.target && onClose()}
>
  <div
    class="flex max-h-[min(520px,100%)] min-h-0 w-full max-w-145 flex-col overflow-hidden popover"
    transition:popoverMotion={{ duration: 140 }}
  >
    <header class="flex h-12 shrink-0 items-center gap-2.5 border-b border-line-subtle px-4 text-ink-muted">
      <Search size={16} />
      <input
        bind:this={input}
        bind:value={query}
        role="combobox"
        aria-label="Search or run a command"
        aria-autocomplete="list"
        aria-expanded="true"
        aria-controls="palette-results"
        aria-activedescendant={results[selected] ? `palette-entry-${selected}` : undefined}
        oninput={() => (selected = 0)}
        placeholder="Jump to or do anything"
        class="h-full min-w-0 flex-1 bg-transparent text-md text-ink-strong outline-none placeholder:text-ink-faint"
      />
      {#if loading}<Spinner class="text-ink-faint" />{/if}
      <Kbd>Esc</Kbd>
    </header>
    <div
      id="palette-results"
      bind:this={list}
      class="min-h-0 overflow-y-auto p-1.5"
      role="listbox"
      aria-label="Results"
    >
      {#each results as entry, index (entry.key)}
        {#if index === 0 || results[index - 1].section !== entry.section}
          <div class="px-2.5 pt-2.5 pb-1 text-xs font-medium text-ink-faint" role="presentation">{entry.section}</div>
        {/if}
        <button
          id="palette-entry-{index}"
          data-entry={index}
          role="option"
          aria-selected={index === selected}
          tabindex="-1"
          class={[
            'flex h-10 w-full items-center gap-3 rounded-lg px-2.5 text-left',
            index === selected && 'bg-surface-muted'
          ]}
          onmouseenter={() => (selected = index)}
          onclick={() => run(entry)}
        >
          <entry.icon size={15} class={index === selected ? 'text-brand' : 'text-ink-muted'} />
          <span class="min-w-0 flex-1 truncate text-sm text-ink-strong">{entry.label}</span>
          {#if entry.detail}<span class="max-w-[45%] truncate text-xs text-ink-muted">{entry.detail}</span>{/if}
          {#if entry.keys}<Kbd>{entry.keys}</Kbd>{/if}
        </button>
      {:else}
        {#if !loading}<p class="px-4 py-10 text-center text-sm text-ink-muted">Nothing matches that.</p>{/if}
      {/each}
    </div>
  </div>
</dialog>
