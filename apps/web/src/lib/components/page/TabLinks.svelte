<script lang="ts">
  let {
    label,
    items,
    class: className = ''
  }: {
    label: string;
    items: Array<{ href: string; label: string; count?: number; active: boolean }>;
    class?: string;
  } = $props();
</script>

<nav aria-label={label} class={['flex flex-wrap items-center gap-1', className]}>
  {#each items as item (item.href)}
    <a
      href={item.href}
      aria-current={item.active ? 'page' : undefined}
      class={[
        'inline-flex h-8.5 items-center gap-2 rounded-full px-3 text-sm font-semibold transition-colors',
        item.active ? 'bg-surface-muted text-ink-strong' : 'text-ink-muted hover:bg-surface-hover hover:text-ink-strong'
      ]}
      >{item.label}{#if item.count !== undefined}<span
          class={['text-xs tabular-nums', item.active ? 'text-ink-muted' : 'text-ink-faint']}>{item.count}</span
        >{/if}</a
    >
  {/each}
</nav>
