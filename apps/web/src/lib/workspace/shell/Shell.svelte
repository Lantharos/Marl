<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { RepositorySummary } from '@marl/contracts';
  import LegalUpdateNotice from '#lib/legal/LegalUpdateNotice.svelte';
  import type { ShellUser } from '#lib/shell-cache.js';
  import { plainKey } from '#lib/ui/keyboard.js';
  import { workspace } from '../store/workspace.svelte';
  import Palette from './Palette.svelte';
  import Rail from './Rail.svelte';
  import { shell } from './shell-state.svelte';
  import Shortcuts from './Shortcuts.svelte';

  let {
    user,
    repositories,
    legalAccepted,
    children
  }: { user: ShellUser; repositories: RepositorySummary[]; legalAccepted: boolean; children: Snippet } = $props();

  $effect(() => {
    workspace.forViewer(user.id);
    void workspace.inbox.load();
  });

  function keydown(event: KeyboardEvent) {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      shell.paletteOpen = !shell.paletteOpen;
      return;
    }
    const key = plainKey(event);
    if (key === ']') shell.toggleInspector();
    else if (key === '?') shell.shortcutsOpen = true;
    else return;
    event.preventDefault();
  }
</script>

<svelte:window onkeydown={keydown} />

<div
  class="grid h-dvh grid-cols-[52px_minmax(0,1fr)] overflow-hidden bg-canvas text-ink max-md:grid-cols-1 max-md:grid-rows-[minmax(0,1fr)_56px]"
>
  <div class="max-md:order-last md:contents"><Rail {user} {repositories} /></div>
  <main id="main" class="flex min-h-0 min-w-0 flex-col" tabindex="-1">
    {#if !legalAccepted}<LegalUpdateNotice />{/if}
    <div class="min-h-0 flex-1">{@render children()}</div>
  </main>
</div>

{#if shell.paletteOpen}<Palette {repositories} onClose={() => (shell.paletteOpen = false)} />{/if}
<Shortcuts open={shell.shortcutsOpen} onClose={() => (shell.shortcutsOpen = false)} />
