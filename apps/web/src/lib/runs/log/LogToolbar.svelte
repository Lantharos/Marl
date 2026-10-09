<script lang="ts">
  import ChevronDown from '@lucide/svelte/icons/chevron-down';
  import ChevronUp from '@lucide/svelte/icons/chevron-up';
  import ChevronsDownUp from '@lucide/svelte/icons/chevrons-down-up';
  import ChevronsUpDown from '@lucide/svelte/icons/chevrons-up-down';
  import Download from '@lucide/svelte/icons/download';
  import SearchX from '@lucide/svelte/icons/search-x';
  import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
  import Button from '#lib/components/controls/Button.svelte';
  import SearchField from '#lib/components/controls/SearchField.svelte';
  import Tooltip from '#lib/components/overlays/Tooltip.svelte';
  import type { LogSearch } from './log-search.svelte';

  let {
    search,
    input = $bindable(),
    allExpanded,
    canJump,
    onstep,
    onjump,
    ontoggle,
    ondownload
  }: {
    search: LogSearch;
    input?: HTMLInputElement;
    allExpanded: boolean;
    canJump: boolean;
    onstep: (direction: 1 | -1) => void;
    onjump: () => void;
    ontoggle: () => void;
    ondownload: () => void;
  } = $props();
  const total = $derived(search.matches.length);
</script>

<div class="flex flex-wrap items-center gap-1.5">
  <div class="flex min-w-0 basis-full items-center gap-1 sm:basis-auto">
    <SearchField
      bind:value={search.query}
      bind:input
      label="Search log"
      class="w-full sm:w-64"
      onkeydown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          onstep(event.shiftKey ? -1 : 1);
        } else if (event.key === 'Escape' && search.query) {
          event.stopPropagation();
          search.query = '';
        }
      }}
    />
    {#if search.query.trim()}
      <span class="min-w-14 px-1 text-center text-xs text-ink-muted tabular-nums" aria-live="polite"
        >{#if total}{search.current + 1}/{total}{search.capped ? '+' : ''}{:else}<SearchX
            size={14}
            class="inline text-ink-faint"
            aria-label="No matches"
          />{/if}</span
      >
      <Button icon size="small" variant="ghost" disabled={!total} aria-label="Previous match" onclick={() => onstep(-1)}
        ><ChevronUp size={15} /></Button
      >
      <Button icon size="small" variant="ghost" disabled={!total} aria-label="Next match" onclick={() => onstep(1)}
        ><ChevronDown size={15} /></Button
      >
    {/if}
  </div>
  <div class="ml-auto flex items-center gap-1">
    {#if canJump}<Button size="small" variant="ghost" class="text-danger" onclick={onjump}
        ><TriangleAlert size={14} />Jump to failure</Button
      >{/if}
    <Tooltip text={allExpanded ? 'Collapse all steps' : 'Expand all steps'} as="label">
      {#snippet children(tooltip)}
        <Button icon size="small" variant="ghost" {...tooltip} onclick={ontoggle}
          >{#if allExpanded}<ChevronsDownUp size={15} />{:else}<ChevronsUpDown size={15} />{/if}</Button
        >
      {/snippet}
    </Tooltip>
    <Tooltip text="Download log" as="label">
      {#snippet children(tooltip)}
        <Button icon size="small" variant="ghost" {...tooltip} onclick={ondownload}><Download size={15} /></Button>
      {/snippet}
    </Tooltip>
  </div>
</div>
