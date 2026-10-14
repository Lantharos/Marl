<script lang="ts">
  import type { Snippet } from 'svelte';
  import Tooltip from '#lib/components/overlays/Tooltip.svelte';

  let {
    href,
    label,
    active = false,
    count = 0,
    class: className = '',
    icon
  }: {
    href: string;
    label: string;
    active?: boolean;
    count?: number;
    class?: string;
    icon: Snippet;
  } = $props();
</script>

<Tooltip text={label} placement="right" as="label">
  {#snippet children(tooltip)}
    <a
      {...tooltip}
      {href}
      aria-current={active ? 'page' : undefined}
      class={[
        'relative grid size-9 shrink-0 place-items-center rounded-lg transition-colors',
        active ? 'bg-surface-muted text-ink-strong' : 'text-ink-muted hover:bg-surface-hover hover:text-ink-strong',
        className
      ]}
    >
      {@render icon()}
      {#if count}<span
          class="absolute -top-0.5 -right-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-brand px-1 text-2xs leading-none font-semibold text-on-brand tabular-nums"
          aria-label="{count} unread">{count > 99 ? '99+' : count}</span
        >{/if}
    </a>
  {/snippet}
</Tooltip>
