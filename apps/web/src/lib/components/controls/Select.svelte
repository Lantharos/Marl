<script lang="ts">
  import Check from '@lucide/svelte/icons/check';
  import ChevronDown from '@lucide/svelte/icons/chevron-down';
  import Popover from '../overlays/Popover.svelte';

  type Option = { value: string; label: string; description?: string };
  let {
    value = $bindable(),
    options,
    ariaLabel,
    onchange
  }: {
    value: string;
    options: Option[];
    ariaLabel: string;
    onchange?: (value: string) => void | Promise<void>;
  } = $props();
  let open = $state(false);
  let activeIndex = $state(0);
  const selected = $derived(options.find((option) => option.value === value) ?? options[0]);

  async function choose(option: Option) {
    const changed = option.value !== value;
    value = option.value;
    open = false;
    if (changed) await onchange?.(value);
  }

  function openAt(index: number) {
    activeIndex = index;
    open = true;
  }

  function triggerKeydown(event: KeyboardEvent) {
    if (open || (event.key !== 'ArrowDown' && event.key !== 'ArrowUp')) return;
    event.preventDefault();
    openAt(event.key === 'ArrowDown' ? 0 : options.length - 1);
  }

  function listKeydown(event: KeyboardEvent) {
    if (event.key === 'Home') activeIndex = 0;
    else if (event.key === 'End') activeIndex = options.length - 1;
    else if (event.key === 'ArrowDown') activeIndex = (activeIndex + 1) % options.length;
    else if (event.key === 'ArrowUp') activeIndex = (activeIndex - 1 + options.length) % options.length;
    else return;
    event.preventDefault();
  }

  function focusActive(listbox: HTMLElement) {
    listbox.querySelectorAll<HTMLElement>('[role="option"]')[activeIndex]?.focus();
  }
</script>

<Popover
  bind:open
  placement="bottom-start"
  matchWidth
  class="max-h-72 p-1.5 text-ink"
  role="listbox"
  tabindex={-1}
  aria-label={ariaLabel}
  onkeydown={listKeydown}
  {@attach focusActive}
>
  {#snippet trigger(popover)}
    <button
      {...popover}
      type="button"
      aria-label={ariaLabel}
      aria-haspopup="listbox"
      onkeydown={triggerKeydown}
      onclick={() => (activeIndex = Math.max(0, options.indexOf(selected)))}
      class="flex h-full field min-h-11 items-center justify-between gap-3 py-2 text-left hover:border-line-strong"
    >
      <span class="min-w-0">
        <span class="block truncate text-sm font-medium text-ink-strong">{selected?.label ?? 'Choose…'}</span>
        {#if selected?.description}<span class="mt-0.5 block truncate text-xs text-ink-muted"
            >{selected.description}</span
          >{/if}
      </span>
      <ChevronDown size={15} class="text-ink-muted" />
    </button>
  {/snippet}
  {#each options as option, index (option.value)}
    <button
      type="button"
      role="option"
      tabindex={index === activeIndex ? 0 : -1}
      aria-selected={option.value === value}
      class={[
        'grid min-h-10 w-full grid-cols-[minmax(0,1fr)_18px] items-center gap-2 rounded-lg p-2.5 text-left outline-none',
        index === activeIndex && 'bg-surface-muted'
      ]}
      onmouseenter={() => (activeIndex = index)}
      onclick={() => choose(option)}
    >
      <span class="min-w-0">
        <span class="block truncate text-sm font-medium text-ink-strong">{option.label}</span>
        {#if option.description}<span class="mt-0.5 block text-xs text-ink-muted">{option.description}</span>{/if}
      </span>
      {#if option.value === value}<Check size={15} class="text-brand" />{/if}
    </button>
  {/each}
</Popover>
