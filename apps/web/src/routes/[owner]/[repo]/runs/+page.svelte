<script lang="ts">
  import type { WorkflowSummary } from '@marl/contracts';
  import { page } from '$app/state';
  import CircleAlert from '@lucide/svelte/icons/circle-alert';
  import FileCode2 from '@lucide/svelte/icons/file-code-corner';
  import Zap from '@lucide/svelte/icons/zap';
  import EmptyState from '$lib/components/feedback/EmptyState.svelte';
  import FilterBar from '$lib/components/page/FilterBar.svelte';
  import PageHeader from '$lib/components/page/PageHeader.svelte';
  import Time from '$lib/components/page/Time.svelte';
  import { awaitingCheckApproval, runStateLabel } from '$lib/runs/run-state';
  import RunStateIcon from '$lib/runs/RunStateIcon.svelte';
  import { workflowTrigger } from '$lib/runs/workflow-triggers';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
  const owner = $derived(page.params.owner);
  const repo = $derived(page.params.repo);
  let query = $state('');
  let activeFilter = $state('All');
  const filtered = $derived(
    data.workflows.filter(
      (workflow) =>
        (activeFilter === 'All' || category(workflow) === activeFilter) &&
        `${workflow.name} ${workflow.path} ${workflow.triggers.join(' ')}`
          .toLowerCase()
          .includes(query.trim().toLowerCase())
    )
  );

  function category(workflow: WorkflowSummary) {
    if (workflow.status === 'invalid' || workflow.lastRun?.state === 'failure') return 'Failure';
    if (workflow.lastRun?.state === 'queued' || workflow.lastRun?.state === 'running') return 'Active';
    if (workflow.lastRun?.state === 'success') return 'Success';
    return null;
  }
</script>

<svelte:head><title>Workflows · {owner}/{repo} · Marl</title></svelte:head>

<PageHeader title="Workflows" />
<FilterBar
  placeholder="Search workflows"
  tabs={['All', 'Active', 'Success', 'Failure']}
  bind:active={activeFilter}
  bind:query
/>
{#if filtered.length}
  <div class="surface p-1.5">
    {#each filtered as workflow (workflow.id)}
      <a
        class="group grid grid-cols-[32px_minmax(0,1fr)] items-center gap-3 rounded-lg px-3 py-3.5 transition-colors hover:bg-surface-hover sm:grid-cols-[32px_minmax(0,1fr)_minmax(180px,240px)] sm:gap-4"
        href="/{owner}/{repo}/runs/workflows/{workflow.id}"
      >
        <span
          class={[
            'grid size-8 place-items-center rounded-lg',
            workflow.status === 'invalid' ? 'bg-danger-soft text-danger' : 'bg-brand-soft text-brand'
          ]}><Zap size={16} /></span
        >
        <span class="min-w-0">
          <strong class="block truncate text-base font-semibold text-ink-strong group-hover:text-brand"
            >{workflow.name}</strong
          >
          <span class="mt-0.5 flex items-center gap-1 truncate font-mono text-xs text-ink-muted"
            ><FileCode2 size={12} class="shrink-0" />{workflow.path}</span
          >
          <span class="mt-2 flex flex-wrap gap-1.5">
            {#each workflow.triggers as trigger (trigger)}
              {@const { label, icon: Icon } = workflowTrigger(trigger)}
              <span
                class="inline-flex items-center gap-1 rounded-md bg-surface-muted px-1.5 py-0.5 text-2xs font-medium text-ink-muted"
                ><Icon size={11} />{label}</span
              >
            {/each}
          </span>
        </span>
        <span class="col-start-2 flex min-w-0 items-center gap-2.5 sm:col-start-3">
          {#if workflow.lastRun}
            <RunStateIcon
              state={workflow.lastRun.state}
              awaitingApproval={awaitingCheckApproval(workflow.lastRun)}
              size={17}
            />
            <span class="min-w-0">
              <strong class="block text-sm font-semibold text-ink capitalize">{runStateLabel(workflow.lastRun)}</strong>
              <span class="block text-xs text-ink-muted"
                >#{workflow.lastRun.number} · <Time value={workflow.lastRun.queuedAt} class="text-ink-muted" /></span
              >
            </span>
          {:else if workflow.status === 'invalid'}
            <CircleAlert size={17} class="shrink-0 text-danger" />
            <span class="min-w-0">
              <strong class="block text-sm font-semibold text-danger">Needs attention</strong>
              <span class="block truncate text-xs text-ink-muted" title={workflow.error}>{workflow.error}</span>
            </span>
          {:else}
            <RunStateIcon state="queued" label="Not run yet" size={17} />
            <span class="min-w-0">
              <strong class="block text-sm font-semibold text-ink">Not run yet</strong>
              <span class="block text-xs text-ink-muted"
                >{workflow.jobs} {workflow.jobs === 1 ? 'job' : 'jobs'} ready</span
              >
            </span>
          {/if}
        </span>
      </a>
    {/each}
  </div>
{:else}
  <div class="surface">
    <EmptyState
      icon={Zap}
      title={query || activeFilter !== 'All' ? 'No matching workflows' : 'No workflows yet'}
      description={query || activeFilter !== 'All'
        ? 'Try a different name, path, trigger, or state.'
        : 'Add a YAML workflow under .marl/workflows or .github/workflows and push it.'}
    />
  </div>
{/if}
