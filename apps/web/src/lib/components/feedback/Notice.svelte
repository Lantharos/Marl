<script lang="ts">
  import type { Snippet } from 'svelte';
  import CircleAlert from '@lucide/svelte/icons/circle-alert';
  import CircleCheck from '@lucide/svelte/icons/circle-check';

  let {
    tone = 'danger',
    class: className = '',
    children
  }: { tone?: 'danger' | 'success' | 'warning'; class?: string; children: Snippet } = $props();
</script>

<p
  role={tone === 'danger' ? 'alert' : 'status'}
  class={[
    'flex items-start gap-2 rounded-md px-3 py-2.5 text-sm leading-snug',
    tone === 'danger' && 'bg-danger-soft text-danger',
    tone === 'success' && 'bg-success-soft text-success',
    tone === 'warning' && 'bg-warning-soft text-warning',
    className
  ]}
>
  {#if tone === 'success'}<CircleCheck size={15} class="mt-px shrink-0" />{:else}<CircleAlert
      size={15}
      class="mt-px shrink-0"
    />{/if}
  <span class="min-w-0">{@render children()}</span>
</p>
