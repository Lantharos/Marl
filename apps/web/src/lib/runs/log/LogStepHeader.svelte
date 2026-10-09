<script lang="ts">
  import ChevronRight from '@lucide/svelte/icons/chevron-right';
  import { formatDuration } from '../duration';
  import type { JobStep } from './job-steps';
  import StepStateIcon from './StepStateIcon.svelte';

  let {
    step,
    now,
    open,
    top,
    offset,
    pinned = false,
    ontoggle
  }: {
    step: JobStep;
    now: number;
    open: boolean;
    top: number;
    offset: number;
    pinned?: boolean;
    ontoggle: () => void;
  } = $props();
  const lines = $derived(step.to - step.from);
  const duration = $derived(
    step.startedAt === null
      ? null
      : formatDuration((step.endedAt ?? (step.state === 'running' ? now : step.startedAt)) - step.startedAt)
  );
</script>

<button
  type="button"
  class={[
    'absolute left-0 z-1 flex h-9 w-(--log-width) items-center gap-2.5 px-3 text-left font-sans text-sm transition-colors',
    pinned ? 'z-2 bg-surface shadow-[0_1px_0_var(--color-line-subtle)]' : 'bg-surface',
    lines ? 'hover:bg-surface-hover' : 'cursor-default'
  ]}
  style:top="{top}px"
  style:transform="translateX({offset}px)"
  aria-expanded={lines ? open : undefined}
  disabled={!lines}
  onclick={ontoggle}
>
  <ChevronRight size={14} class={['shrink-0 text-ink-faint', !lines && 'invisible']} />
  <StepStateIcon state={step.state} />
  <span
    class={[
      'min-w-0 flex-1 truncate',
      step.state === 'queued' || step.state === 'skipped' ? 'text-ink-muted' : 'font-semibold text-ink-strong'
    ]}>{step.name}</span
  >
  {#if duration}<span class="shrink-0 text-xs text-ink-muted tabular-nums">{duration}</span>{/if}
</button>
