<script lang="ts">
  import type { Snippet } from 'svelte';

  let { sidebar, content }: { sidebar: Snippet; content: Snippet } = $props();
</script>

<div
  class="mx-auto grid w-full max-w-270 gap-7 px-4 pt-6 pb-20 sm:px-6 md:grid-cols-[220px_minmax(0,780px)] md:gap-10 md:pt-9"
>
  <aside class="min-w-0 md:sticky md:top-20 md:self-start">{@render sidebar()}</aside>
  <main class="min-w-0">{@render content()}</main>
</div>
