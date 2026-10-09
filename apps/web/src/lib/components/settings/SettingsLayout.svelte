<script lang="ts">
  import type { Snippet } from 'svelte';

  let { sidebar, content }: { sidebar: Snippet; content: Snippet } = $props();
</script>

<div class="grid gap-7 md:grid-cols-[200px_minmax(0,1fr)] md:gap-10 lg:grid-cols-[220px_minmax(0,880px)] lg:gap-14">
  <aside class="min-w-0 md:sticky md:top-20 md:self-start">{@render sidebar()}</aside>
  <div class="min-w-0">{@render content()}</div>
</div>
