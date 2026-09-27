<script lang="ts">
  let { compact = false }: { compact?: boolean } = $props();
</script>

<span
  class={[
    'inline-flex items-end gap-1 font-mono leading-none font-bold tracking-[-0.08em] text-ink-strong',
    compact ? 'text-base' : 'text-lg'
  ]}
  aria-label="Marl"
>
  <span>marl</span><span class="mb-px size-1.25 rounded-[1px] bg-brand" aria-hidden="true"></span>
</span>
