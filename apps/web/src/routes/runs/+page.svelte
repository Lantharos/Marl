<script lang="ts">
  import { goto } from '$app/navigation';
  import { untrack } from 'svelte';
  import type { RunSummary } from '@marl/contracts';
  import CircleAlert from 'lucide-svelte/icons/circle-alert';
  import CircleCheck from 'lucide-svelte/icons/circle-check';
  import CircleDot from 'lucide-svelte/icons/circle-dot';
  import GitBranch from 'lucide-svelte/icons/git-branch';
  import { api } from '$lib/api';
  import Button from '$lib/components/Button.svelte';
  import FilterBar from '$lib/components/FilterBar.svelte';
  import PageHeader from '$lib/components/PageHeader.svelte';
  import Time from '$lib/components/Time.svelte';
  import type { PageData } from './$types';

  let { data } = $props<{ data: PageData }>();
  let runs = $state<RunSummary[]>(untrack(() => data.runs));
  let nextCursor = $state<string | null>(untrack(() => data.nextCursor));
  let query = $state(untrack(() => data.query));
  let activeFilter = $state(untrack(() => data.state[0].toUpperCase() + data.state.slice(1)));
  let loadingMore = $state(false);
  let queryTimer: ReturnType<typeof setTimeout> | undefined;

  $effect(() => {
    runs = [...data.runs];
    nextCursor = data.nextCursor;
    query = data.query;
    activeFilter = data.state[0].toUpperCase() + data.state.slice(1);
  });

  function navigate(state = activeFilter, value = query) {
    const params = new URLSearchParams();
    if (state.toLowerCase() !== 'all') params.set('state', state.toLowerCase());
    if (value.trim()) params.set('q', value.trim());
    void goto(`/runs${params.size ? `?${params}` : ''}`, { keepFocus: true, noScroll: true, replaceState: true });
  }

  function changeQuery(value: string) {
    clearTimeout(queryTimer);
    queryTimer = setTimeout(() => navigate(activeFilter, value), 220);
  }

  async function loadMore() {
    if (!nextCursor || loadingMore) return;
    loadingMore = true;
    const result = await api<{ runs: RunSummary[]; nextCursor: string | null }>(`/runs?limit=30&state=${activeFilter.toLowerCase()}&q=${encodeURIComponent(query.trim())}&cursor=${encodeURIComponent(nextCursor)}`);
    runs = [...runs, ...result.runs];
    nextCursor = result.nextCursor;
    loadingMore = false;
  }
</script>

<svelte:head><title>Runs · Marl</title></svelte:head>

<main class="page">
  <PageHeader title="Runs" description="Every workflow, job, and log across your repositories." />
  <FilterBar placeholder="Search runs" tabs={['All', 'Active', 'Success', 'Failure', 'Canceled']} bind:active={activeFilter} bind:query onActiveChange={() => navigate()} onQueryChange={changeQuery} />
  <section class="list" aria-label="Workflow runs">
    {#each runs as run}
      <a class="row" href="/{run.repository.owner}/{run.repository.name}/runs/{run.number}">
        <span class="state {run.state}">{#if run.state === 'running' || run.state === 'queued'}<CircleDot size={18} />{:else if run.state === 'failure'}<CircleAlert size={18} />{:else}<CircleCheck size={18} />{/if}</span>
        <span class="main">
          <strong>{run.name}</strong>
          <small>{run.repository.owner}/{run.repository.name} · run #{run.number} · <Time value={run.queuedAt} /></small>
          <code><GitBranch size={12} />{run.branch}<i>{run.commit.slice(0, 7)}</i></code>
        </span>
        <span class="run-meta"><span class="run-state {run.state}">{run.state}</span><small>{run.jobs} {run.jobs === 1 ? 'job' : 'jobs'}</small></span>
      </a>
    {:else}
      <div class="empty">
        <strong>{query ? 'No matching runs' : `No ${activeFilter === 'All' ? '' : activeFilter.toLowerCase() + ' '}runs yet`}</strong>
        <p>{query ? 'Try another workflow, repository, branch, or commit.' : activeFilter === 'All' ? 'Connect a runner and push a workflow to start your first run.' : 'Runs will appear here when they reach this state.'}</p>
        {#if !query && activeFilter === 'All'}<a href="/runners/new">Connect a runner</a>{/if}
      </div>
    {/each}
  </section>
  {#if nextCursor}<Button class="load-more" loading={loadingMore} onclick={loadMore}>Load more</Button>{/if}
</main>

<style>
  .page{width:min(920px,calc(100% - 48px));margin:0 auto;padding:44px 0 72px}.list{display:grid;gap:4px}.row{display:grid;grid-template-columns:36px minmax(0,1fr) auto;align-items:center;gap:12px;min-height:80px;padding:10px 12px;border-radius:8px;color:inherit;text-decoration:none;transition:background-color 120ms ease}.row:hover{background:var(--surface-hover)}.state{display:grid;width:32px;height:32px;place-items:center;border-radius:8px;background:var(--surface-muted);color:var(--text-muted)}.state.running,.state.queued{background:var(--brand-soft);color:var(--brand)}.state.failure{background:var(--danger-soft);color:var(--danger)}.state.success{background:var(--success-soft);color:var(--success)}.main{min-width:0}.main strong,.main small{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.main strong{color:var(--text-strong);font-size:13px}.main small{margin-top:4px;color:var(--text-muted);font-size:10px}.main small :global(time){font-size:10px}code{display:flex;align-items:center;gap:5px;margin-top:5px;color:var(--text);font-size:9px}code i{color:var(--text-muted);font-style:normal}.run-meta{display:grid;justify-items:end;gap:5px}.run-meta small{color:var(--text-faint);font-size:9px}.run-state{padding:4px 7px;border-radius:999px;background:var(--surface-muted);color:var(--text-muted);font-size:9px;font-weight:650;text-transform:capitalize}.run-state.running,.run-state.queued{background:var(--brand-soft);color:var(--brand)}.run-state.failure{background:var(--danger-soft);color:var(--danger)}.run-state.success{background:var(--success-soft);color:var(--success)}.empty{padding:68px 4px;color:var(--text-muted);text-align:center}.empty strong{color:var(--text-strong);font-size:15px}.empty p{margin:7px 0 0;font-size:12px}.empty a{display:inline-flex;margin-top:15px;color:var(--brand-strong);font-size:12px;text-decoration:none}.page :global(.load-more.button){display:flex;margin:18px auto 0}@media(max-width:680px){.page{width:calc(100% - 28px);padding-top:32px}.row{grid-template-columns:36px minmax(0,1fr);padding-inline:6px}.run-meta{display:none}}
</style>
