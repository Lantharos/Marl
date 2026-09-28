<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { tick } from 'svelte';
  import Search from '@lucide/svelte/icons/search';
  import { api } from '$lib/api';
  import { popoverMotion } from '$lib/ui/popover';
  import Spinner from '../feedback/Spinner.svelte';
  import { commandIcons } from './command-icons';
  import { matchCommands, type Command } from './commands';

  let { commands, onClose }: { commands: Command[]; onClose: () => void } = $props();
  let input = $state<HTMLInputElement>();
  let list = $state<HTMLElement>();
  let query = $state('');
  let remote = $state<Command[]>([]);
  let loading = $state(false);
  let selected = $state(0);
  const repositoryPath = $derived(
    page.params.owner && page.params.repo ? `${page.params.owner}/${page.params.repo}` : null
  );
  const codeSearch = $derived<Command[]>(
    repositoryPath && query.trim()
      ? [
          {
            label: `Search code for “${query.trim()}”`,
            detail: repositoryPath,
            href: `/${repositoryPath}/search?q=${encodeURIComponent(query.trim())}`,
            keywords: query,
            kind: 'search'
          }
        ]
      : []
  );
  const results = $derived([...codeSearch, ...matchCommands(commands, query, remote)]);

  $effect(() => {
    const value = query.trim();
    remote = [];
    loading = value.length >= 2;
    if (value.length < 2) return;
    let canceled = false;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const response = await api<{ results: Command[] }>(`/search?q=${encodeURIComponent(value)}`, {
          signal: controller.signal
        });
        if (!canceled) remote = response.results.map((result) => ({ ...result, keywords: result.detail }));
      } catch {
        if (!canceled) remote = [];
      } finally {
        if (!canceled) loading = false;
      }
    }, 140);
    return () => {
      canceled = true;
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
      returnFocus?.focus({ preventScroll: true });
    };
  }

  async function run(command: Command) {
    onClose();
    await goto(command.href);
  }

  async function keydown(event: KeyboardEvent) {
    if (event.key === 'Tab') {
      event.preventDefault();
      input?.focus();
      return;
    }
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
      void run(results[selected]);
    } else return;
    await tick();
    list?.querySelector(`[data-command="${selected}"]`)?.scrollIntoView({ block: 'nearest' });
  }
</script>

<dialog
  {@attach show}
  class="fixed inset-0 m-0 size-full max-h-none max-w-none items-start justify-center bg-transparent px-3 pt-[10dvh] pb-6 text-ink backdrop:bg-black/55 backdrop:backdrop-blur-[3px] open:flex sm:px-5"
  aria-label="Search Marl"
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
        bind:this={input}
        bind:value={query}
        role="combobox"
        aria-label="Search Marl"
        aria-autocomplete="list"
        aria-expanded="true"
        aria-controls="command-results"
        aria-activedescendant={results[selected] ? `command-result-${selected}` : undefined}
        oninput={() => (selected = 0)}
        placeholder="Jump to a repository, issue, pull, or setting"
        class="h-full min-w-0 flex-1 bg-transparent text-base text-ink-strong outline-none placeholder:text-ink-faint"
      />
      {#if loading}<Spinner class="text-ink-faint" />{/if}
      <kbd class="rounded bg-surface-muted px-1.5 py-0.5 font-sans text-2xs text-ink-muted">Esc</kbd>
    </header>
    <div
      id="command-results"
      bind:this={list}
      class="mt-1.5 grid min-h-0 content-start gap-0.5 overflow-y-auto"
      role="listbox"
      aria-label="Results"
    >
      {#each results as command, index (command.href)}
        {@const Icon = commandIcons[command.kind]}
        <button
          id="command-result-{index}"
          data-command={index}
          role="option"
          aria-selected={index === selected}
          tabindex="-1"
          class={[
            'grid min-h-12 w-full grid-cols-[18px_minmax(0,1fr)] items-center gap-3 rounded-lg px-3 py-2 text-left',
            index === selected ? 'bg-surface-muted' : ''
          ]}
          onmouseenter={() => (selected = index)}
          onclick={() => run(command)}
        >
          <Icon size={16} class={index === selected ? 'text-brand' : 'text-ink-muted'} />
          <span class="min-w-0">
            <span class="block truncate text-sm font-semibold text-ink-strong">{command.label}</span>
            <span class="mt-0.5 block truncate text-xs text-ink-muted">{command.detail}</span>
          </span>
        </button>
      {:else}
        {#if !loading}<div class="grid gap-1 px-4 py-10 text-center">
            <strong class="text-base font-semibold text-ink-strong">Nothing found</strong>
            <span class="text-sm text-ink-muted">Try a repository, path, issue, pull, or run.</span>
          </div>{/if}
      {/each}
    </div>
  </div>
</dialog>
