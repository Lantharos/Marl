<script lang="ts">
  import type { Snippet } from 'svelte';

  let { title, children }: { title?: string; children: Snippet } = $props();
</script>

<section class="border-b border-line-subtle px-5 py-4 last:border-b-0">
  {#if title}<h3 class="mb-2.5 text-xs font-semibold text-ink-muted">{title}</h3>{/if}
  {@render children()}
</section>
