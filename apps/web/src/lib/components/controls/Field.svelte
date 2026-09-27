<script lang="ts">
  import type { Snippet } from 'svelte';

  let {
    label,
    hint,
    optional = false,
    class: className = '',
    children
  }: { label: string; hint?: string; optional?: boolean; class?: string; children: Snippet } = $props();
</script>

<label class={['grid min-w-0 content-start gap-2', className]}>
  <span class="text-sm font-semibold text-ink-strong"
    >{label}{#if optional}<span class="ml-1.5 font-normal text-ink-faint">Optional</span>{/if}</span
  >
  {@render children()}
  {#if hint}<span class="text-xs leading-relaxed text-ink-muted">{hint}</span>{/if}
</label>
