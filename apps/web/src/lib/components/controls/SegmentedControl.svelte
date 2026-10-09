<script lang="ts" generics="T extends string">
  import type { ClassValue } from 'svelte/elements';
  import type { IconComponent } from '#lib/ui/icon.js';

  let {
    value = $bindable(),
    options,
    label,
    class: className = '',
    onchange
  }: {
    value: T;
    options: readonly { value: T; label: string; icon?: IconComponent }[];
    label: string;
    class?: ClassValue;
    onchange?: (value: T) => void;
  } = $props();

  let group: HTMLElement;
  const steps: Record<string, number> = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };

  function choose(next: T) {
    if (next === value) return;
    value = next;
    onchange?.(next);
  }

  function keydown(event: KeyboardEvent) {
    const current = options.findIndex((option) => option.value === value);
    const next =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? options.length - 1
          : event.key in steps
            ? (current + steps[event.key] + options.length) % options.length
            : -1;
    if (next === -1) return;
    event.preventDefault();
    choose(options[next].value);
    group.querySelectorAll<HTMLElement>('[role="radio"]')[next].focus();
  }
</script>

<div
  bind:this={group}
  role="radiogroup"
  aria-label={label}
  class={['grid auto-cols-fr grid-flow-col gap-0.5 rounded-lg bg-surface-muted p-0.5', className]}
>
  {#each options as option (option.value)}
    {@const checked = option.value === value}
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      tabindex={checked ? 0 : -1}
      class={[
        'flex h-7 items-center justify-center gap-1.5 rounded-md px-2.5 text-xs font-semibold whitespace-nowrap transition-colors',
        checked ? 'bg-surface-raised text-ink-strong shadow-subtle' : 'text-ink-muted hover:text-ink-strong'
      ]}
      onclick={() => choose(option.value)}
      onkeydown={keydown}
      >{#if option.icon}<option.icon size={13} />{/if}{option.label}</button
    >
  {/each}
</div>
