<script lang="ts">
  import type { RunState } from '@marl/contracts';
  import CircleCheck from '@lucide/svelte/icons/circle-check';
  import CircleDashed from '@lucide/svelte/icons/circle-dashed';
  import CircleSlash from '@lucide/svelte/icons/circle-slash';
  import CircleX from '@lucide/svelte/icons/circle-x';
  import LoaderCircle from '@lucide/svelte/icons/loader-circle';
  import ShieldCheck from '@lucide/svelte/icons/shield-check';

  let {
    state,
    awaitingApproval = false,
    label,
    size = 16
  }: { state: RunState; awaitingApproval?: boolean; label?: string; size?: number } = $props();
</script>

<span
  class={[
    'inline-grid shrink-0 place-items-center',
    awaitingApproval && 'text-warning',
    !awaitingApproval && state === 'success' && 'text-success',
    !awaitingApproval && state === 'failure' && 'text-danger',
    !awaitingApproval && state === 'running' && 'text-brand',
    !awaitingApproval && (state === 'queued' || state === 'canceled') && 'text-ink-faint'
  ]}
  role="img"
  aria-label={label ?? (awaitingApproval ? 'Awaiting approval' : state)}
  title={label}
>
  {#if awaitingApproval}<ShieldCheck {size} />
  {:else if state === 'success'}<CircleCheck {size} />
  {:else if state === 'failure'}<CircleX {size} />
  {:else if state === 'running'}<LoaderCircle {size} class="animate-spin [animation-duration:1.6s]" />
  {:else if state === 'canceled'}<CircleSlash {size} />
  {:else}<CircleDashed {size} />{/if}
</span>
