<script lang="ts">
  import { formatAbsoluteTime, formatTimestamp } from '#lib/time.js';
  import Tooltip from '../overlays/Tooltip.svelte';

  let { value, class: className = '' }: { value: string; class?: string } = $props();
</script>

<Tooltip text={formatAbsoluteTime(value)}>
  {#snippet children(tooltip)}
    <time {...tooltip} class={className || 'text-xs text-ink-muted'} datetime={value}>{formatTimestamp(value)}</time>
  {/snippet}
</Tooltip>
