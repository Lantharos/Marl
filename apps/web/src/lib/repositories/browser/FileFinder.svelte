<script lang="ts">
  import { onDestroy } from 'svelte';
  import File from '@lucide/svelte/icons/file';
  import Folder from '@lucide/svelte/icons/folder';
  import Search from '@lucide/svelte/icons/search';
  import { api } from '$lib/api';
  import { popoverMotion } from '$lib/ui/popover';
  import { entryHref } from './entry-path';
  import type { TreeEntry } from './types';

  let {
    owner,
    repository,
    revision,
    initial,
    onClose
  }: { owner: string; repository: string; revision: string; initial: TreeEntry[]; onClose: () => void } = $props();
  let query = $state('');
  let results = $state<TreeEntry[]>([]);
  let selected = $state(0);
  let timer: ReturnType<typeof setTimeout> | undefined;
  let request = 0;
  const shown = $derived(query.trim() ? results : initial);

  function show(dialog: HTMLDialogElement) {
    dialog.showModal();
  }

  function search() {
    selected = 0;
    clearTimeout(timer);
    const current = ++request;
    if (!query.trim()) return;
    timer = setTimeout(async () => {
      const params = new URLSearchParams({ revision, query: query.trim() });
      const result = await api<{ entries: TreeEntry[] }>(`/repositories/${owner}/${repository}/tree?${params}`).catch(
        () => ({ entries: [] })
      );
      if (current === request) results = result.entries;
    }, 120);
  }

  function keydown(event: KeyboardEvent) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      selected = (selected + step + shown.length) % Math.max(shown.length, 1);
      document.getElementById(`file-result-${selected}`)?.scrollIntoView({ block: 'nearest' });
    }
    if (event.key === 'Enter' && shown[selected]) document.getElementById(`file-result-${selected}`)?.click();
  }

  onDestroy(() => clearTimeout(timer));
</script>

<dialog
  {@attach show}
  class="fixed inset-0 m-0 size-full max-h-none max-w-none items-start justify-center bg-transparent px-3 pt-[10dvh] pb-6 text-ink backdrop:bg-black/55 backdrop:backdrop-blur-[3px] open:flex sm:px-5"
  aria-label="Go to file"
  oncancel={(event) => {
    event.preventDefault();
    onClose();
  }}
  onkeydown={keydown}
  onclick={(event) => event.currentTarget === event.target && onClose()}
>
  <div
    class="flex max-h-[min(580px,100%)] min-h-0 w-full max-w-155 flex-col overflow-hidden popover p-1.5"
    transition:popoverMotion={{ duration: 160 }}
  >
    <header
      class="flex h-12 shrink-0 items-center gap-2.5 rounded-lg border border-transparent bg-surface px-3 text-ink-muted focus-within:border-line-strong"
    >
      <Search size={18} />
      <input
        bind:value={query}
        oninput={search}
        role="combobox"
        aria-label="Search repository files"
        aria-expanded="true"
        aria-controls="file-results"
        aria-activedescendant={shown[selected] ? `file-result-${selected}` : undefined}
        placeholder="Search files in this repository"
        data-1p-ignore
        class="h-full min-w-0 flex-1 bg-transparent text-base text-ink-strong outline-none placeholder:text-ink-faint"
      />
      <kbd class="rounded bg-surface-muted px-1.5 py-0.5 font-sans text-2xs text-ink-muted">Esc</kbd>
    </header>
    <div
      id="file-results"
      class="mt-1.5 grid min-h-0 content-start gap-0.5 overflow-y-auto"
      role="listbox"
      aria-label="Files"
    >
      {#each shown as entry, index (entry.path)}
        <a
          id="file-result-{index}"
          role="option"
          aria-selected={index === selected}
          href={entryHref(owner, repository, revision, entry.kind, entry.path)}
          onclick={onClose}
          onmouseenter={() => (selected = index)}
          class={[
            'grid min-h-10 grid-cols-[16px_minmax(0,1fr)] items-center gap-3 rounded-lg px-3 text-sm',
            index === selected && 'bg-surface-muted'
          ]}
        >
          {#if entry.kind === 'tree'}<Folder size={15} class="fill-current text-brand" />{:else}<File
              size={15}
              class="text-ink-muted"
            />{/if}
          <span class="truncate font-mono text-xs text-ink-strong">{entry.path}</span>
        </a>
      {:else}
        <p class="px-4 py-10 text-center text-sm text-ink-muted">No matching files</p>
      {/each}
    </div>
  </div>
</dialog>
