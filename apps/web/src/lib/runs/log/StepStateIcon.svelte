<script lang="ts">
  import CircleAlert from '@lucide/svelte/icons/circle-alert';
  import CircleMinus from '@lucide/svelte/icons/circle-minus';
  import RunStateIcon from '../RunStateIcon.svelte';
  import type { StepState } from './job-steps';

  let { state, size = 15 }: { state: StepState; size?: number } = $props();
</script>

{#if state === 'warning'}<span
    class="inline-grid shrink-0 place-items-center text-warning"
    role="img"
    aria-label="Failed, continued"><CircleAlert {size} /></span
  >{:else if state === 'skipped'}<span
    class="inline-grid shrink-0 place-items-center text-ink-faint"
    role="img"
    aria-label="Skipped"><CircleMinus {size} /></span
  >{:else}<RunStateIcon {state} {size} />{/if}
