<script lang="ts">
  import type { RunSummary } from '@marl/contracts';
  import CircleAlert from 'lucide-svelte/icons/circle-alert';
  import CircleCheck from 'lucide-svelte/icons/circle-check';
  import CircleDot from 'lucide-svelte/icons/circle-dot';
  import GitBranch from 'lucide-svelte/icons/git-branch';
  import FilterBar from '$lib/components/FilterBar.svelte';
  import PageHeader from '$lib/components/PageHeader.svelte';
  import type { PageData } from './$types';
  let { data } = $props<{ data: PageData }>();
  const runs = $derived(data.runs as RunSummary[]);
  let query = $state('');
  let activeFilter = $state('All');
  const filteredRuns = $derived(runs.filter((run) => {
    const stateMatches = activeFilter === 'All' || (activeFilter === 'Active' ? ['queued', 'running'].includes(run.state) : run.state === activeFilter.toLowerCase());
    const haystack = `${run.name} ${run.repository.owner}/${run.repository.name} ${run.branch} ${run.commit}`.toLowerCase();
    return stateMatches && haystack.includes(query.trim().toLowerCase());
  }));

</script>

<svelte:head><title>Runs · Marl</title></svelte:head>
<main class="page">
  <PageHeader title="Runs" description="Every workflow, job, and log across your repositories." />
  <FilterBar placeholder="Search runs" tabs={['All', 'Active', 'Success', 'Failure', 'Canceled']} bind:active={activeFilter} bind:query />
  <section class="list" aria-label="Workflow runs">
    {#each filteredRuns as run}
      <a class="row" href="/{run.repository.owner}/{run.repository.name}/runs/{run.number}">
        <span class="state {run.state}">{#if run.state === 'running' || run.state === 'queued'}<CircleDot size={17} />{:else if run.state === 'failure'}<CircleAlert size={17} />{:else}<CircleCheck size={17} />{/if}</span>
        <span class="main"><strong>{run.name}</strong><small>{run.repository.owner}/{run.repository.name} · run #{run.number} · {run.queuedAt}</small><code><GitBranch size={10} />{run.branch}<i>{run.commit.slice(0, 7)}</i></code></span>
        <span class="jobs">{run.jobs} {run.jobs === 1 ? 'job' : 'jobs'}</span><span class="run-state">{run.state}</span>
      </a>
    {:else}<div class="empty"><strong>No matching runs</strong><p>Try another status or search.</p></div>{/each}
  </section>
</main>

<style>
  .page{width:min(1060px,calc(100% - 56px));margin:0 auto;padding:48px 0 72px}.row{display:grid;grid-template-columns:30px minmax(0,1fr) 55px 60px;align-items:center;gap:11px;min-height:72px;padding:10px 4px;border-bottom:1px solid var(--border-subtle);color:inherit;text-decoration:none}.row:hover{background:var(--surface-hover)}.state{display:grid;width:28px;height:28px;place-items:center;color:var(--text-faint)}.state.running,.state.queued{color:var(--brand)}.state.failure{color:var(--danger)}.state.success{color:var(--success)}.main{min-width:0}.main strong,.main small{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.main strong{color:var(--text-strong);font-size:11px}.main small{margin-top:3px;color:var(--text-muted);font-size:9px}code{display:flex;align-items:center;gap:4px;margin-top:4px;color:var(--text-muted);font-size:9px}code i{color:var(--text-faint);font-style:normal}.jobs,.run-state{color:var(--text-faint);font-size:9px}.run-state{text-transform:capitalize}.notice{color:var(--warning);font-size:10px}.empty{padding:48px 4px;text-align:center}.empty strong{color:var(--text-strong);font-size:12px}.empty p{color:var(--text-faint);font-size:10px}@media(max-width:680px){.page{width:calc(100% - 28px);padding-top:32px}.row{grid-template-columns:30px minmax(0,1fr) 55px}.jobs{display:none}}
</style>
