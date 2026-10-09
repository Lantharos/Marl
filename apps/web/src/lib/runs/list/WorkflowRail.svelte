<script lang="ts">
  import type { WorkflowSummary } from '@marl/contracts';
  import CircleAlert from '@lucide/svelte/icons/circle-alert';
  import CircleDashed from '@lucide/svelte/icons/circle-dashed';
  import Layers from '@lucide/svelte/icons/layers';
  import { awaitingCheckApproval } from '../run-state';
  import RunStateIcon from '../RunStateIcon.svelte';

  let { workflows, base, selected }: { workflows: WorkflowSummary[]; base: string; selected: string | null } = $props();
  const ordered = $derived(workflows.toSorted((left, right) => Number(right.active) - Number(left.active)));
  const itemClass = (active: boolean) => [
    'flex h-10 shrink-0 items-center gap-2.5 rounded-md px-3 text-sm whitespace-nowrap transition-colors',
    active ? 'bg-surface-muted text-ink-strong' : 'text-ink-muted hover:bg-surface-hover hover:text-ink-strong'
  ];
</script>

<nav
  aria-label="Workflows"
  class="-mx-4 flex gap-1 overflow-x-auto px-4 md:mx-0 md:grid md:gap-0.5 md:overflow-visible md:px-0"
>
  <a href="{base}/runs" class={itemClass(selected === null)} aria-current={selected === null ? 'page' : undefined}
    ><Layers size={16} />All workflows</a
  >
  {#each ordered as workflow (workflow.id)}
    {@const current = workflow.id === selected}
    <a
      href="{base}/runs/workflows/{workflow.id}"
      class={[itemClass(current), !workflow.active && 'opacity-60']}
      aria-current={current ? 'page' : undefined}
    >
      {#if workflow.status === 'invalid'}<CircleAlert size={16} class="shrink-0 text-danger" />
      {:else if workflow.lastRun}<RunStateIcon
          state={workflow.lastRun.state}
          awaitingApproval={awaitingCheckApproval(workflow.lastRun)}
        />
      {:else}<CircleDashed size={16} class="shrink-0 text-ink-faint" />{/if}
      <span class="min-w-0 truncate">{workflow.name}</span>
    </a>
  {/each}
</nav>
