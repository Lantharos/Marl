<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { HTMLButtonAttributes } from 'svelte/elements';
  import X from '@lucide/svelte/icons/x';

  let {
    active = false,
    removable = false,
    color,
    children,
    class: className = '',
    ...attributes
  }: HTMLButtonAttributes & {
    active?: boolean;
    removable?: boolean;
    color?: string;
    children: Snippet;
  } = $props();
</script>

<button
  {...attributes}
  type="button"
  class={[
    'inline-flex h-8.5 shrink-0 items-center justify-center gap-1.5 rounded-full px-3 text-sm leading-none font-semibold whitespace-nowrap transition-colors active:brightness-95',
    removable
      ? 'border border-(--chip-color)/35 bg-(--chip-color)/12 text-ink-strong'
      : active
        ? 'bg-surface-muted text-ink-strong'
        : 'text-ink-muted hover:bg-surface-hover hover:text-ink-strong',
    className
  ]}
  style:--chip-color={color}
  aria-pressed={removable ? undefined : active}
>
  {#if color}<span class="size-2 shrink-0 rounded-full bg-(--chip-color)" aria-hidden="true"></span>{/if}
  {@render children()}
  {#if removable}<X size={12} aria-hidden="true" />{/if}
</button>
