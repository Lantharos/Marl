<script lang="ts">
  import { formatAbsoluteTime, formatTimestamp } from '$lib/time';

  let { value, class: className = '' } = $props<{ value: string; class?: string }>();
</script>

<time class={className} datetime={value} title={formatAbsoluteTime(value)}>{formatTimestamp(value)}</time>

<style>
  time{color:var(--text-faint);font-size:9px}.end{margin-left:auto}.right{text-align:right}
</style>
