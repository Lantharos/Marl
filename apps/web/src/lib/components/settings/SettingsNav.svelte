<script lang="ts">
  import type { LucideIcon } from '@lucide/svelte';

  type Item = { href: string; label: string; icon: LucideIcon; active: boolean };
  let { label, groups }: { label: string; groups: Item[][] } = $props();
</script>

<nav
  aria-label={label}
  class="-mx-4 flex gap-1 overflow-x-auto px-4 md:mx-0 md:grid md:gap-4 md:overflow-visible md:px-0"
>
  {#each groups as items, index (items[0]?.href ?? index)}
    {#if index}<span class="my-auto h-5 w-px shrink-0 bg-line md:hidden" aria-hidden="true"></span>{/if}
    <div class="flex gap-1 md:grid md:gap-0.5">
      {#each items as item (item.href)}
        <a
          href={item.href}
          aria-current={item.active ? 'page' : undefined}
          class={[
            'flex h-10 shrink-0 items-center gap-2.5 rounded-md px-3 text-sm whitespace-nowrap transition-colors',
            item.active
              ? 'bg-surface-muted text-ink-strong'
              : 'text-ink-muted hover:bg-surface-hover hover:text-ink-strong'
          ]}><item.icon size={16} />{item.label}</a
        >
      {/each}
    </div>
  {/each}
</nav>
