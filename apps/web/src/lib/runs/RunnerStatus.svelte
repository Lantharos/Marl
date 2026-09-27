<script lang="ts">
  import type { RunnerSummary } from '@marl/contracts';

  let { state }: { state: RunnerSummary['state'] } = $props();
</script>

<span
  class={[
    'inline-flex items-center gap-1.5 text-xs font-semibold capitalize',
    state === 'busy' ? 'text-brand' : state === 'offline' ? 'text-ink-faint' : 'text-success'
  ]}><span class="size-1.5 rounded-full bg-current" aria-hidden="true"></span>{state}</span
>
