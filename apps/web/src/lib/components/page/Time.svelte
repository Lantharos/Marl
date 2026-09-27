<script lang="ts">
  import { formatAbsoluteTime, formatTimestamp } from '$lib/time';

  let { value, class: className = '' }: { value: string; class?: string } = $props();
</script>

<time class={className || 'text-xs text-ink-muted'} datetime={value} title={formatAbsoluteTime(value)}
  >{formatTimestamp(value)}</time
>
