<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { ClassValue } from 'svelte/elements';

  let {
    width = 'wide',
    class: className,
    children
  }: { width?: 'narrow' | 'wide'; class?: ClassValue; children: Snippet } = $props();
</script>

<main
  id="main-content"
  tabindex="-1"
  class={['page-frame pt-8 pb-20 outline-none sm:pt-10', width === 'narrow' && '[--page-width:768px]', className]}
>
  {@render children()}
</main>
