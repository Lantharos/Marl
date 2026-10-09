<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { ClassValue } from 'svelte/elements';

  let { class: className = '', children }: { class?: ClassValue; children: Snippet } = $props();
</script>

<kbd
  class={[
    'inline-flex h-5 min-w-5 items-center justify-center rounded-sm bg-surface-muted px-1.5 font-sans text-2xs font-medium text-ink-muted shadow-[inset_0_-1px_0_var(--color-line)]',
    className
  ]}>{@render children()}</kbd
>
