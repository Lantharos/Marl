<script lang="ts">
  import Plus from '@lucide/svelte/icons/plus';
  import { dismissable } from '$lib/actions/dismissable';
  import Button from '../controls/Button.svelte';
  import Chip from '../controls/Chip.svelte';
  import SearchField from '../controls/SearchField.svelte';
  import MetadataPicker from '../overlays/MetadataPicker.svelte';

  type FilterLabel = { name: string; color: string; description?: string };

  let {
    placeholder,
    tabs = ['Open', 'Closed'],
    active = $bindable('Open'),
    query = $bindable(''),
    labelOptions = [],
    selectedLabels = $bindable([]),
    onActiveChange,
    onQueryChange,
    onLabelsChange
  }: {
    placeholder: string;
    tabs?: string[];
    active?: string;
    query?: string;
    labelOptions?: FilterLabel[];
    selectedLabels?: string[];
    onActiveChange?: (value: string) => void;
    onQueryChange?: (value: string) => void;
    onLabelsChange?: (value: string[]) => void;
  } = $props();

  let labelsOpen = $state(false);
  let labelQuery = $state('');
  let labelAnchor = $state<HTMLElement>();
  const pickerOptions = $derived(
    labelOptions
      .filter((label) =>
        `${label.name} ${label.description ?? ''}`.toLowerCase().includes(labelQuery.trim().toLowerCase())
      )
      .map((label) => ({
        id: label.name,
        title: label.name,
        detail: label.description,
        color: label.color,
        selected: selectedLabels.includes(label.name)
      }))
  );

  function toggleLabel(name: string) {
    selectedLabels = selectedLabels.includes(name)
      ? selectedLabels.filter((label) => label !== name)
      : [...selectedLabels, name];
    onLabelsChange?.(selectedLabels);
  }
</script>

<div class="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
  <div class="flex min-w-0 flex-wrap items-center gap-1" aria-label="Filters">
    {#each tabs as tab (tab)}<Chip
        active={tab === active}
        onclick={() => {
          active = tab;
          onActiveChange?.(tab);
        }}>{tab}</Chip
      >{/each}
    {#if labelOptions.length || selectedLabels.length}
      <span class="mx-1.5 h-4.5 w-px bg-line" aria-hidden="true"></span>
      {#each selectedLabels as name (name)}
        {@const label = labelOptions.find((option) => option.name === name)}
        <Chip
          removable
          color={label?.color ?? 'var(--color-ink-faint)'}
          aria-label={`Remove ${name} filter`}
          onclick={() => toggleLabel(name)}>{name}</Chip
        >
      {/each}
      <div use:dismissable={() => (labelsOpen = false)}>
        <Button
          size="small"
          icon
          variant="ghost"
          class="rounded-full bg-surface-raised"
          aria-label="Filter by label"
          aria-expanded={labelsOpen}
          onclick={(event) => {
            labelAnchor = event.currentTarget;
            labelsOpen = !labelsOpen;
            labelQuery = '';
          }}><Plus size={15} /></Button
        >
        {#if labelsOpen}
          <MetadataPicker
            anchor={labelAnchor}
            bind:query={labelQuery}
            placeholder="Find a label"
            options={pickerOptions}
            empty="No matching labels"
            onToggle={toggleLabel}
          />
        {/if}
      </div>
    {/if}
  </div>
  <SearchField bind:value={query} label={placeholder} class="w-full sm:w-72" oninput={() => onQueryChange?.(query)} />
</div>
