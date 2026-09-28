<script lang="ts">
  import type { Snippet } from 'svelte';
  import { onMount } from 'svelte';
  import type { RepositorySummary } from '@marl/contracts';
  import Menu from '@lucide/svelte/icons/menu';
  import Search from '@lucide/svelte/icons/search';
  import X from '@lucide/svelte/icons/x';
  import { dismissable } from '$lib/actions/dismissable';
  import BrandMark from '../identity/BrandMark.svelte';
  import AccountMenu from './AccountMenu.svelte';
  import CommandPalette from './commands/CommandPalette.svelte';
  import type { ShellOrganization, ShellUser } from '$lib/shell-cache';
  import { shellCommands } from './commands/commands';
  import CreateMenu from './CreateMenu.svelte';
  import GlobalNav from './GlobalNav.svelte';
  import KeyboardShortcuts from './KeyboardShortcuts.svelte';
  import { plainKey } from '$lib/ui/keyboard';

  let {
    repositories,
    organizations,
    user,
    children
  }: {
    repositories: RepositorySummary[];
    organizations: ShellOrganization[];
    user: ShellUser;
    children: Snippet;
  } = $props();
  let searchOpen = $state(false);
  let mobileOpen = $state(false);
  let createOpen = $state(false);
  let accountOpen = $state(false);
  let shortcutsOpen = $state(false);
  let shortcut = $state('Ctrl K');
  const commands = $derived(shellCommands(user, repositories, organizations));

  onMount(() => {
    if (/Mac|iPhone|iPad/.test(navigator.platform)) shortcut = '⌘K';
  });

  function closeMenus() {
    mobileOpen = false;
    createOpen = false;
    accountOpen = false;
  }

  function openSearch() {
    closeMenus();
    searchOpen = true;
  }

  function keydown(event: KeyboardEvent) {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      if (searchOpen) searchOpen = false;
      else openSearch();
    }
    if (event.key === 'Escape') closeMenus();
    if (plainKey(event) === '?') {
      event.preventDefault();
      shortcutsOpen = true;
    }
  }
</script>

<svelte:window onkeydown={keydown} />

<div class="min-h-dvh bg-canvas text-ink">
  <header
    class="fixed inset-x-0 top-0 z-50 grid h-13 grid-cols-[auto_1fr_auto] items-center gap-2.5 border-b border-line-subtle bg-canvas/90 px-3 backdrop-blur-lg sm:gap-3.5 sm:px-5 lg:grid-cols-[auto_auto_1fr_auto]"
    use:dismissable={() => (mobileOpen = false)}
  >
    <a class="flex px-1 py-1.5" href="/" aria-label="Home"><BrandMark /></a>
    <GlobalNav open={mobileOpen} onNavigate={() => (mobileOpen = false)} />
    <button
      class="flex h-8 field min-h-0 w-full max-w-105 cursor-text items-center gap-2 justify-self-center px-2.5 text-ink-faint max-sm:w-8 max-sm:justify-center max-sm:justify-self-end max-sm:border-transparent max-sm:bg-transparent max-sm:p-0 lg:w-[min(420px,calc(100vw-620px))]"
      aria-label="Find anything"
      aria-keyshortcuts="Control+K Meta+K"
      onclick={openSearch}
    >
      <Search size={15} class="shrink-0" />
      <span class="flex-1 text-left text-sm max-sm:hidden">Find anything</span>
      <kbd
        class="rounded border border-line bg-surface-muted px-1.5 py-px font-sans text-2xs text-ink-muted max-sm:hidden"
        >{shortcut}</kbd
      >
    </button>
    <div class="flex items-center justify-end gap-1.5">
      <CreateMenu bind:open={createOpen} />
      <AccountMenu {user} bind:open={accountOpen} />
      <button
        class="grid size-8 place-items-center rounded-md text-ink-muted transition-colors hover:bg-surface-muted hover:text-ink-strong lg:hidden"
        aria-label="Toggle navigation"
        aria-expanded={mobileOpen}
        onclick={() => (mobileOpen = !mobileOpen)}
        >{#if mobileOpen}<X size={18} />{:else}<Menu size={18} />{/if}</button
      >
    </div>
  </header>
  <main class="min-h-dvh pt-13">{@render children()}</main>
</div>

{#if searchOpen}<CommandPalette {commands} onClose={() => (searchOpen = false)} />{/if}
<KeyboardShortcuts open={shortcutsOpen} onClose={() => (shortcutsOpen = false)} />
