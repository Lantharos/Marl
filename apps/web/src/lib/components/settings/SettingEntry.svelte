<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { LucideIcon } from '@lucide/svelte';

  let {
    icon: Icon,
    iconClass = 'text-ink-muted',
    title,
    href,
    mono = false,
    children,
    actions
  }: {
    icon?: LucideIcon;
    iconClass?: string;
    title: string;
    href?: string;
    mono?: boolean;
    children?: Snippet;
    actions?: Snippet;
  } = $props();
</script>

<article
  class={[
    'grid min-h-19 items-center gap-3 py-3',
    Icon ? 'grid-cols-[18px_minmax(0,1fr)_auto]' : 'grid-cols-[minmax(0,1fr)_auto]'
  ]}
>
  {#if Icon}<Icon size={18} class={iconClass} />{/if}
  <div class="min-w-0">
    <svelte:element
      this={href ? 'a' : 'strong'}
      {href}
      class={[
        'block font-semibold break-words text-ink-strong',
        mono ? 'font-mono text-sm' : 'text-base',
        href && 'hover:text-brand'
      ]}>{title}</svelte:element
    >
    {#if children}<div class="mt-0.5 grid gap-0.5 text-sm text-ink-muted">{@render children()}</div>{/if}
  </div>
  {#if actions}<div class="flex shrink-0 items-center gap-1.5">{@render actions()}</div>{/if}
</article>
