<script lang="ts">
  import type { RunSummary, WorkflowSummary } from '@marl/contracts';
  import PageHeader from '#lib/components/page/PageHeader.svelte';
  import RunFeed from './RunFeed.svelte';
  import type { RunStateFilter } from './run-query';
  import WorkflowHeader from './WorkflowHeader.svelte';
  import WorkflowRail from './WorkflowRail.svelte';

  let {
    owner,
    repository,
    workflows,
    workflowId = null,
    runs,
    nextCursor,
    state,
    query,
    canDispatch
  }: {
    owner: string;
    repository: string;
    workflows: WorkflowSummary[];
    workflowId?: string | null;
    runs: RunSummary[];
    nextCursor: string | null;
    state: RunStateFilter;
    query: string;
    canDispatch: boolean;
  } = $props();
  const base = $derived(`/${owner}/${repository}`);
  const workflow = $derived(workflows.find((item) => item.id === workflowId));
  const endpoint = $derived(
    `/repositories/${owner}/${repository}/runs${workflowId ? `?workflow=${encodeURIComponent(workflowId)}` : ''}`
  );
</script>

<PageHeader title="Runs" />
<div class="grid gap-6 md:grid-cols-[208px_minmax(0,1fr)] lg:grid-cols-[232px_minmax(0,1fr)] lg:gap-10">
  <aside class="min-w-0 md:sticky md:top-20 md:self-start">
    <WorkflowRail {workflows} {base} selected={workflowId} />
  </aside>
  <div class="min-w-0">
    {#if workflow}<WorkflowHeader {workflow} {owner} {repository} {canDispatch} />{/if}
    <RunFeed
      {runs}
      {nextCursor}
      {endpoint}
      {state}
      {query}
      emptyDescription={workflows.length
        ? 'Runs appear here when a declared trigger fires.'
        : 'Add a YAML workflow under .marl/workflows or .github/workflows and push it.'}
    />
  </div>
</div>
