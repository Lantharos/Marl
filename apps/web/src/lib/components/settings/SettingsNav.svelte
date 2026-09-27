<script lang="ts">
  import type { IconComponent } from '$lib/ui/icon';

  let {
    label,
    items
  }: {
    label: string;
    items: Array<{ href: string; label: string; icon: IconComponent; active: boolean }>;
  } = $props();
</script>

<nav
  aria-label={label}
  class="-mx-4 flex gap-1 overflow-x-auto px-4 md:mx-0 md:grid md:gap-0.5 md:overflow-visible md:px-0"
>
  {#each items as item (item.href)}
    <a
      href={item.href}
      aria-current={item.active ? 'page' : undefined}
      class={[
        'flex h-10 shrink-0 items-center gap-2.5 rounded-md px-3 text-sm whitespace-nowrap transition-colors',
        item.active ? 'bg-surface-muted text-ink-strong' : 'text-ink-muted hover:bg-surface-hover hover:text-ink-strong'
      ]}><item.icon size={16} />{item.label}</a
    >
  {/each}
</nav>
