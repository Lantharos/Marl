<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { IconComponent } from '$lib/ui/icon';

  let {
    icon: Icon,
    title,
    description,
    compact = false,
    class: className = '',
    children
  }: {
    icon?: IconComponent;
    title: string;
    description?: string;
    compact?: boolean;
    class?: string;
    children?: Snippet;
  } = $props();
</script>

<div class={['grid justify-items-center text-center', compact ? 'gap-1.5 px-4 py-8' : 'gap-2 px-6 py-14', className]}>
  {#if Icon}<span class="mb-1 grid size-10 place-items-center rounded-full bg-surface-muted text-ink-muted"
      ><Icon size={18} /></span
    >{/if}
  <strong class="text-base font-semibold text-ink-strong">{title}</strong>
  {#if description}<p class="max-w-[46ch] text-sm text-pretty text-ink-muted">{description}</p>{/if}
  {#if children}<div class="mt-2 flex flex-wrap justify-center gap-2">{@render children()}</div>{/if}
</div>
