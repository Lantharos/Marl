<script lang="ts">
  import type { PullStack } from '@marl/contracts';
  import Layers from '@lucide/svelte/icons/layers';

  let { stack, repository }: { stack: PullStack; repository: string } = $props();
</script>

{#if stack.base || stack.dependents.length}
  <nav
    class="mt-3 grid gap-1 rounded-lg bg-surface-muted/70 px-3 py-2.5 text-xs text-ink-muted"
    aria-label="Stacked pulls"
  >
    <span class="flex items-center gap-1.5 font-semibold text-ink"><Layers size={13} />Stacked pulls</span>
    {#if stack.base}<span class="truncate"
        >Builds on <a
          class="font-medium text-ink-strong hover:text-brand"
          href="/{repository}/pulls/{stack.base.number}">!{stack.base.number} {stack.base.title}</a
        ></span
      >{/if}
    {#each stack.dependents as dependent (dependent.number)}<span class="truncate"
        ><a class="font-medium text-ink-strong hover:text-brand" href="/{repository}/pulls/{dependent.number}"
          >!{dependent.number} {dependent.title}</a
        > builds on this</span
      >{/each}
    {#if stack.dependents.length}<span class="text-ink-faint">Merging this retargets them to its target branch.</span
      >{/if}
  </nav>
{/if}
