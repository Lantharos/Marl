<script lang="ts">
  import ArrowLeft from '@lucide/svelte/icons/arrow-left';

  let { href, label }: { href: string; label: string } = $props();
</script>

<a
  {href}
  class="inline-flex items-center gap-1.5 text-sm text-ink-muted no-underline transition-colors hover:text-brand"
  ><ArrowLeft size={14} strokeWidth={1.9} /><span>{label}</span></a
>
