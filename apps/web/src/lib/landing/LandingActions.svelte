<script lang="ts">
  import ArrowRight from '@lucide/svelte/icons/arrow-right';
  import type { ClassValue } from 'svelte/elements';
  import LinkButton from '#lib/components/controls/LinkButton.svelte';

  let { class: className }: { class: ClassValue } = $props();
</script>

<div class={className}>
  <LinkButton variant="primary" size="large" href="/sign-up">Create an account <ArrowRight size={16} /></LinkButton>
  <a
    class="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-ink-strong transition-colors hover:text-brand"
    href="/lantharos/marl">Read Marl’s source</a
  >
</div>
