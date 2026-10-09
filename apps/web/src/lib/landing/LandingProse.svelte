<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { ClassValue } from 'svelte/elements';

  let { class: className, children }: { class?: ClassValue; children: Snippet } = $props();
</script>

<p
  class={[
    'text-base leading-[1.75] text-pretty text-ink-muted max-sm:text-md [&_a]:text-ink [&_a]:underline [&_a]:decoration-line-strong [&_a]:underline-offset-4 [&_a:hover]:text-brand-strong',
    className
  ]}
>
  {@render children()}
</p>
