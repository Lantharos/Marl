<script lang="ts">
  import { onDestroy } from 'svelte';
  import type { WorkItemLabel } from '@marl/contracts';
  import ChevronDown from '@lucide/svelte/icons/chevron-down';
  import Tag from '@lucide/svelte/icons/tag';
  import Chip, { chipClass } from '#lib/components/controls/Chip.svelte';
  import SearchField from '#lib/components/controls/SearchField.svelte';
  import MetadataPicker from '#lib/components/overlays/MetadataPicker.svelte';
  import Menu from '#lib/components/overlays/menu/Menu.svelte';
  import MenuItem from '#lib/components/overlays/menu/MenuItem.svelte';
  import type { IssueFilters, IssueStateFilter, IssueView } from './issue-list';

  let {
    filters,
    counts,
    labelOptions = [],
    personal,
    onChange
  }: {
    filters: IssueFilters;
    counts?: { open?: number; closed?: number };
    labelOptions?: WorkItemLabel[];
    personal: boolean;
    onChange: (filters: IssueFilters) => void;
  } = $props();
  let query = $derived(filters.query);
  let labelQuery = $state('');
  let timer: ReturnType<typeof setTimeout> | undefined;
  onDestroy(() => clearTimeout(timer));

  const states: { value: IssueStateFilter; label: string }[] = [
    { value: 'open', label: 'Open' },
    { value: 'closed', label: 'Closed' },
    { value: 'all', label: 'All' }
  ];
  const viewLabels: Record<IssueView, string> = {
    all: 'All discussions',
    unanswered: 'Unanswered',
    following: 'Following',
    unread: 'Unread'
  };
  const views = $derived<IssueView[]>(personal ? ['all', 'unanswered', 'following', 'unread'] : ['all', 'unanswered']);
  const labelPicker = $derived(
    labelOptions
      .filter((label) => `${label.name} ${label.description}`.toLowerCase().includes(labelQuery.trim().toLowerCase()))
      .map((label) => ({
        id: label.name,
        title: label.name,
        detail: label.description || undefined,
        color: label.color,
        selected: filters.labels.includes(label.name)
      }))
  );

  function change(patch: Partial<IssueFilters>) {
    clearTimeout(timer);
    onChange({ ...filters, query, ...patch });
  }

  function search() {
    clearTimeout(timer);
    timer = setTimeout(() => onChange({ ...filters, query }), 220);
  }

  function toggleLabel(name: string) {
    change({
      labels: filters.labels.includes(name)
        ? filters.labels.filter((label) => label !== name)
        : [...filters.labels, name]
    });
  }
</script>

<div
  class="z-10 -mx-1 mb-3 flex flex-col gap-2.5 bg-canvas px-1 py-2 sm:sticky sm:top-13 sm:flex-row sm:items-center sm:justify-between"
>
  <div class="-mx-1 flex min-w-0 items-center gap-1 overflow-x-auto px-1" role="toolbar" aria-label="Issue filters">
    {#each states as state (state.value)}
      {@const count = state.value === 'all' ? undefined : counts?.[state.value]}
      <Chip active={filters.state === state.value} onclick={() => change({ state: state.value })}
        >{state.label}{#if count !== undefined}<span class="font-medium text-ink-faint tabular-nums">{count}</span
          >{/if}</Chip
      >
    {/each}
    <span class="mx-1.5 h-4.5 w-px shrink-0 bg-line" aria-hidden="true"></span>
    <Menu label="Discussion filter" placement="bottom-start" class="w-52">
      {#snippet trigger(menu)}
        <button type="button" class={chipClass(filters.view !== 'all')} {...menu}
          >{viewLabels[filters.view]}<ChevronDown size={14} /></button
        >
      {/snippet}
      {#each views as view (view)}<MenuItem checked={filters.view === view} onselect={() => change({ view })}
          >{viewLabels[view]}</MenuItem
        >{/each}
    </Menu>
    {#if labelOptions.length || filters.labels.length}
      {#each filters.labels as name (name)}
        <Chip
          removable
          color={labelOptions.find((option) => option.name === name)?.color ?? 'var(--color-ink-faint)'}
          aria-label={`Remove ${name} filter`}
          onclick={() => toggleLabel(name)}>{name}</Chip
        >
      {/each}
      <MetadataPicker
        bind:query={labelQuery}
        placeholder="Find a label"
        options={labelPicker}
        empty="No matching labels"
        onToggle={toggleLabel}
      >
        {#snippet trigger(popover)}
          <button
            type="button"
            class={chipClass(false)}
            aria-label="Filter by label"
            onclick={() => (labelQuery = '')}
            {...popover}
            ><Tag size={14} />{#if !filters.labels.length}<span class="max-sm:hidden">Label</span>{/if}</button
          >
        {/snippet}
      </MetadataPicker>
    {/if}
  </div>
  <SearchField bind:value={query} label="Search issues" class="w-full sm:w-64" oninput={search} />
</div>
