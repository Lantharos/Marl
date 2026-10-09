<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { ClassValue } from 'svelte/elements';

  let { id, class: className, children }: { id?: string; class?: ClassValue; children: Snippet } = $props();
</script>

<h2
  {id}
  class={[
    'text-[clamp(44px,6.4vw,88px)] leading-[0.96] font-semibold tracking-[-0.06em] text-balance text-ink-strong',
    className
  ]}
>
  {@render children()}
</h2>
