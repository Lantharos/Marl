<script lang="ts">
  import { tick } from 'svelte';
  import Check from '@lucide/svelte/icons/check';
  import ChevronDown from '@lucide/svelte/icons/chevron-down';
  import { dismissable } from '$lib/actions/dismissable';
  import { anchoredPopover, popoverMotion } from '$lib/ui/popover';

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
  const id = $props.id();
  const listboxId = `${id}-listbox`;
  let open = $state(false);
  let activeIndex = $state(0);
  let trigger = $state<HTMLButtonElement>();
  let menu = $state<HTMLDivElement>();
  const selected = $derived(options.find((option) => option.value === value) ?? options[0]);

  function optionId(index: number) {
    return `${id}-option-${index}`;
  }

  function closeMenu(restoreFocus = false) {
    open = false;
    if (restoreFocus) trigger?.focus();
  }

  async function focusActiveOption() {
    await tick();
    menu?.querySelector<HTMLElement>(`#${CSS.escape(optionId(activeIndex))}`)?.focus();
  }

  async function choose(option: Option) {
    const changed = option.value !== value;
    value = option.value;
    closeMenu(true);
    if (changed) await onchange?.(value);
  }

  async function openMenu(direction?: 'first' | 'last') {
    if (!options.length) return;
    open = true;
    activeIndex = Math.max(
      0,
      options.findIndex((option) => option.value === value)
    );
    if (direction === 'first') activeIndex = 0;
    if (direction === 'last') activeIndex = options.length - 1;
    await tick();
    menu?.showPopover();
    await focusActiveOption();
  }

  function keydown(event: KeyboardEvent) {
    if (!open && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
      event.preventDefault();
      void openMenu(event.key === 'ArrowDown' ? 'first' : 'last');
      return;
    }
    if (!open) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      closeMenu(true);
      return;
    }
    if (event.key === 'Tab') {
      closeMenu();
      return;
    }
    if (event.key === 'Home') activeIndex = 0;
    else if (event.key === 'End') activeIndex = options.length - 1;
    else if (event.key === 'ArrowDown') activeIndex = (activeIndex + 1) % options.length;
    else if (event.key === 'ArrowUp') activeIndex = (activeIndex - 1 + options.length) % options.length;
    else return;
    event.preventDefault();
    void focusActiveOption();
  }
</script>

<div class="relative" use:dismissable={() => closeMenu()}>
  <button
    bind:this={trigger}
    type="button"
    aria-label={ariaLabel}
    aria-haspopup="listbox"
    aria-controls={listboxId}
    aria-expanded={open}
    onkeydown={keydown}
    onclick={() => (open ? closeMenu(true) : void openMenu())}
    class="flex h-full field min-h-11 items-center justify-between gap-3 py-2 text-left hover:border-line-strong"
  >
    <span class="min-w-0">
      <span class="block truncate text-sm font-medium text-ink-strong">{selected?.label ?? 'Choose…'}</span>
      {#if selected?.description}<span class="mt-0.5 block truncate text-xs text-ink-muted">{selected.description}</span
        >{/if}
    </span>
    <ChevronDown size={15} class="text-ink-muted" />
  </button>
  {#if open}
    <div
      bind:this={menu}
      id={listboxId}
      popover="manual"
      class="fixed inset-auto m-0 max-h-72 overflow-auto popover p-1.5 text-ink"
      role="listbox"
      tabindex="-1"
      aria-label={ariaLabel}
      onkeydown={keydown}
      {@attach anchoredPopover(trigger, { align: 'start', matchWidth: true })}
      transition:popoverMotion
    >
      {#each options as option, index (option.value)}
        <button
          id={optionId(index)}
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
    </div>
  {/if}
</div>
