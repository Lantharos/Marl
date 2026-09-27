<script lang="ts">
  import type { Snippet } from 'svelte';

  let { title, description, children }: { title: string; description?: string; children?: Snippet } = $props();
</script>

<div class="flex min-h-20 items-center justify-between gap-4 py-4 sm:gap-6">
  <div class="min-w-0">
    <h3 class="text-base font-semibold text-ink-strong">{title}</h3>
    {#if description}<p class="mt-1 text-sm break-words text-ink-muted">{description}</p>{/if}
  </div>
  {#if children}<div class="flex shrink-0 items-center gap-2">{@render children()}</div>{/if}
</div>
