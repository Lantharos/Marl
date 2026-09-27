<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { IconComponent } from '$lib/ui/icon';

  let {
    href,
    icon: Icon,
    onclick,
    children
  }: { href?: string; icon: IconComponent; onclick?: () => void; children: Snippet } = $props();
  const classes =
    'flex min-h-10 w-full items-center gap-3 rounded-lg px-2.5 text-left text-sm text-ink transition-colors hover:bg-surface-hover hover:text-ink-strong [&>svg]:shrink-0 [&>svg]:text-ink-muted';
</script>

{#if href}<a {href} class={classes} {onclick}><Icon size={16} />{@render children()}</a>{:else}<button
    type="button"
    class={classes}
    {onclick}><Icon size={16} />{@render children()}</button
  >{/if}
