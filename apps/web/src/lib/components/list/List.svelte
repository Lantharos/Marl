<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { HTMLAttributes } from 'svelte/elements';

  let {
    as = 'div',
    class: className,
    children,
    ...attributes
  }: HTMLAttributes<HTMLElement> & { as?: 'div' | 'section'; children: Snippet } = $props();
</script>

<svelte:element this={as} {...attributes} class={['surface p-1.5', className]}>{@render children()}</svelte:element>
