<script lang="ts">
  import type { Snippet } from 'svelte';

  let { width = 'default', children }: { width?: 'narrow' | 'default' | 'wide'; children: Snippet } = $props();
  const widths = { narrow: 'max-w-215', default: 'max-w-240', wide: 'max-w-290' };
</script>

<main class={['mx-auto w-full px-4 pt-8 pb-20 sm:px-6 sm:pt-10', widths[width]]}>{@render children()}</main>
