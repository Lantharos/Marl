<script lang="ts">
  import Check from '@lucide/svelte/icons/check';
  import ChevronDown from '@lucide/svelte/icons/chevron-down';
  import GitBranch from '@lucide/svelte/icons/git-branch';
  import Button from '#lib/components/controls/Button.svelte';
  import SearchField from '#lib/components/controls/SearchField.svelte';
  import Popover from '#lib/components/overlays/Popover.svelte';
  import Time from '#lib/components/page/Time.svelte';

  type Branch = { name: string; commitId: string; updatedAt: string };

  let {
    branches,
    selected,
    href,
    class: className = ''
  }: { branches: Branch[]; selected: string; href: (branch: string) => string; class?: string } = $props();
  let open = $state(false);
  let query = $state('');
  const matches = $derived(branches.filter((branch) => branch.name.toLowerCase().includes(query.trim().toLowerCase())));
</script>

<Popover
  bind:open
  placement="bottom-start"
  class="grid w-[min(340px,calc(100vw-32px))] gap-1.5 p-1.5"
  role="dialog"
  aria-label="Switch branch"
>
  {#snippet trigger(popover)}
    <Button size="small" class={['min-w-0', className]} {...popover}
      ><GitBranch size={15} /><span class="min-w-0 flex-1 truncate text-left font-mono text-xs">{selected}</span
      ><ChevronDown size={13} class="text-ink-muted" /></Button
    >
  {/snippet}
  <SearchField label="Find a branch" bind:value={query} data-1p-ignore />
  <div class="grid max-h-80 gap-0.5 overflow-y-auto" role="listbox" aria-label="Branches">
    {#each matches as branch (branch.name)}
      <a
        role="option"
        aria-selected={branch.name === selected}
        class="grid grid-cols-[minmax(0,1fr)_16px] items-center gap-2 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-surface-hover"
        href={href(branch.name)}
        onclick={() => (open = false)}
      >
        <span class="min-w-0">
          <strong class="block truncate font-mono text-sm font-semibold text-ink-strong">{branch.name}</strong>
          <span class="mt-0.5 block text-xs text-ink-muted"
            >{branch.commitId.slice(0, 7)} · <Time value={branch.updatedAt} class="text-ink-muted" /></span
          >
        </span>
        {#if branch.name === selected}<Check size={14} class="text-brand" />{/if}
      </a>
    {:else}
      <p class="px-2.5 py-4 text-center text-sm text-ink-muted">No matching branches</p>
    {/each}
  </div>
</Popover>
