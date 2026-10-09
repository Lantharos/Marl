<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { HTMLAnchorAttributes } from 'svelte/elements';

  let {
    as = 'div',
    href,
    class: className,
    children,
    ...attributes
  }: HTMLAnchorAttributes & { as?: 'div' | 'article'; children: Snippet } = $props();
</script>

<svelte:element
  this={href ? 'a' : as}
  {href}
  {...attributes}
  class={['rounded-lg px-3 transition-colors hover:bg-surface-hover', className]}>{@render children()}</svelte:element
>
