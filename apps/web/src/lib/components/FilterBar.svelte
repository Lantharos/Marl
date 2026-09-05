<script lang="ts">
  import Check from 'lucide-svelte/icons/check';
  import Plus from 'lucide-svelte/icons/plus';
  import Search from 'lucide-svelte/icons/search';
  import Button from './Button.svelte';
  import Chip from './Chip.svelte';
  import { dismissable } from '$lib/actions/dismissable';

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
  }: { placeholder: string; tabs?: string[]; active?: string; query?: string; labelOptions?: FilterLabel[]; selectedLabels?: string[]; onActiveChange?: (value: string) => void; onQueryChange?: (value: string) => void; onLabelsChange?: (value: string[]) => void } = $props();

  let labelsOpen = $state(false);
  let labelQuery = $state('');
  const filteredLabels = $derived(labelOptions.filter((label) => `${label.name} ${label.description ?? ''}`.toLowerCase().includes(labelQuery.trim().toLowerCase())));

  function toggleLabel(name: string) {
    selectedLabels = selectedLabels.includes(name) ? selectedLabels.filter((label) => label !== name) : [...selectedLabels, name];
    onLabelsChange?.(selectedLabels);
  }
</script>

<div class="filter-bar">
  <div class="filters" aria-label="Filters">
    <div class="tabs">{#each tabs as tab (tab)}<Chip active={tab === active} onclick={() => { active = tab; onActiveChange?.(tab); }}>{tab}</Chip>{/each}</div>
    {#if labelOptions.length || selectedLabels.length}
      <span class="divider" aria-hidden="true"></span>
      <div class="selected-labels">
        {#each selectedLabels as name (name)}
          {@const label = labelOptions.find((option) => option.name === name)}
          <Chip removable color={label?.color ?? 'var(--text-faint)'} aria-label={`Remove ${name} filter`} onclick={() => toggleLabel(name)}>{name}</Chip>
        {/each}
      </div>
      <div class="label-picker" use:dismissable={() => (labelsOpen = false)}>
        <Button class="add-label" size="small" icon variant="ghost" aria-label="Add label filter" aria-expanded={labelsOpen} onclick={() => { labelsOpen = !labelsOpen; labelQuery = ''; }}><Plus size={14} /></Button>
        {#if labelsOpen}
          <div class="label-menu">
            <label class="label-search"><Search size={13} /><input bind:value={labelQuery} aria-label="Find a label" placeholder="Find a label" /></label>
            <div class="label-options">
              {#each filteredLabels as label (label.name)}
                <Button class="label-option" variant="ghost" onclick={() => toggleLabel(label.name)}>
                  <span class="label-copy"><b style:background={label.color}></b><span><strong>{label.name}</strong>{#if label.description}<small>{label.description}</small>{/if}</span></span>
                  {#if selectedLabels.includes(label.name)}<Check size={13} />{/if}
                </Button>
              {:else}<p>No matching labels</p>{/each}
            </div>
          </div>
        {/if}
      </div>
    {/if}
  </div>
  <label class="query"><Search size={14} /><input bind:value={query} oninput={() => onQueryChange?.(query)} aria-label={placeholder} {placeholder} /></label>
</div>

<style>
  .filter-bar{display:flex;align-items:center;justify-content:space-between;gap:14px;margin-bottom:22px}.filters,.tabs,.selected-labels{display:flex;min-width:0;align-items:center;gap:4px}.filters{flex-wrap:wrap}.divider{width:1px;height:18px;margin:0 5px;background:var(--border)}.label-picker{position:relative}.label-picker :global(.add-label.button){border:0;border-radius:999px;background:var(--surface-raised)}.label-picker :global(.add-label.button:hover){border-color:var(--border-strong)}.label-menu{position:absolute;z-index:80;top:35px;left:0;width:min(270px,calc(100vw - 48px));padding:6px;border:1px solid var(--border-strong);border-radius:8px;background:var(--surface-raised);box-shadow:var(--shadow-card)}.label-search,.query{display:flex;align-items:center;gap:7px;border:1px solid var(--border);border-radius:8px;background:var(--surface);color:var(--text-faint)}.label-search{height:36px;padding:0 10px}.query{width:min(280px,42%);height:36px;padding:0 11px}.label-search:focus-within,.query:focus-within{border-color:var(--brand)}input{min-width:0;width:100%;border:0;outline:0;background:transparent;color:var(--text-strong);font-size:12px}input::placeholder{color:var(--text-faint)}.label-options{display:grid;max-height:260px;overflow-y:auto;margin-top:5px;padding-top:3px;border-top:1px solid var(--border-subtle)}.label-options :global(.label-option.button){height:auto;min-height:38px;justify-content:space-between;padding:6px 7px;text-align:left}.label-copy{display:flex;min-width:0;align-items:center;gap:8px}.label-copy>b{width:9px;height:9px;flex:0 0 auto;border-radius:50%}.label-copy strong,.label-copy small{display:block;overflow:hidden;max-width:190px;text-overflow:ellipsis;white-space:nowrap}.label-copy strong{color:var(--text-strong);font-size:12px}.label-copy small{margin-top:2px;color:var(--text-faint);font-size:11px}.label-options>p{margin:0;padding:18px 8px;color:var(--text-faint);font-size:11px;text-align:center}@media(max-width:680px){.filter-bar{align-items:stretch;flex-direction:column}.query{width:100%}.selected-labels{flex-wrap:wrap}}
</style>
