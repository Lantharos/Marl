<script lang="ts">
  import Check from '@lucide/svelte/icons/check';
  import ChevronDown from '@lucide/svelte/icons/chevron-down';
  import GitBranch from '@lucide/svelte/icons/git-branch';
  import { dismissable } from '$lib/actions/dismissable';
  import Button from '$lib/components/controls/Button.svelte';
  import SearchField from '$lib/components/controls/SearchField.svelte';
  import Time from '$lib/components/page/Time.svelte';
  import { popoverMotion } from '$lib/ui/popover';

  type Branch = { name: string; commitId: string; updatedAt: string };

  let { branches, selected, onSelect }: { branches: Branch[]; selected: string; onSelect: (branch: string) => void } =
    $props();
  let open = $state(false);
  let query = $state('');
  const matches = $derived(branches.filter((branch) => branch.name.toLowerCase().includes(query.trim().toLowerCase())));
</script>

<div class="relative" use:dismissable={() => (open = false)}>
  <Button size="small" aria-expanded={open} aria-haspopup="listbox" onclick={() => (open = !open)}
    ><GitBranch size={15} /><span class="max-w-48 truncate font-mono text-xs">{selected}</span><ChevronDown
      size={13}
      class="text-ink-muted"
    /></Button
  >
  {#if open}
    <div
      class="absolute top-10 left-0 z-30 grid w-[min(340px,calc(100vw-32px))] origin-top-left gap-1.5 popover p-1.5"
      transition:popoverMotion
    >
      <SearchField label="Find a branch" bind:value={query} data-1p-ignore />
      <div class="grid max-h-80 gap-0.5 overflow-y-auto" role="listbox" aria-label="Branches">
        {#each matches as branch (branch.name)}
          <button
            type="button"
            role="option"
            aria-selected={branch.name === selected}
            class="grid grid-cols-[minmax(0,1fr)_16px] items-center gap-2 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-surface-hover"
            onclick={() => {
              open = false;
              onSelect(branch.name);
            }}
          >
            <span class="min-w-0">
              <strong class="block truncate font-mono text-sm font-semibold text-ink-strong">{branch.name}</strong>
              <span class="mt-0.5 block text-xs text-ink-muted"
                >{branch.commitId.slice(0, 7)} · <Time value={branch.updatedAt} class="text-ink-muted" /></span
              >
            </span>
            {#if branch.name === selected}<Check size={14} class="text-brand" />{/if}
          </button>
        {:else}
          <p class="px-2.5 py-4 text-center text-sm text-ink-muted">No matching branches</p>
        {/each}
      </div>
    </div>
  {/if}
</div>
