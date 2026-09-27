<script lang="ts">
  import { goto } from '$app/navigation';
  import { onDestroy, untrack } from 'svelte';
  import type { RunSummary } from '@marl/contracts';
  import CirclePlay from '@lucide/svelte/icons/circle-play';
  import { api, MarlApiError } from '$lib/api';
  import LinkButton from '$lib/components/controls/LinkButton.svelte';
  import EmptyState from '$lib/components/feedback/EmptyState.svelte';
  import InfiniteScroll from '$lib/components/feedback/InfiniteScroll.svelte';
  import Page from '$lib/components/page/Page.svelte';
  import FilterBar from '$lib/components/page/FilterBar.svelte';
  import PageHeader from '$lib/components/page/PageHeader.svelte';
  import RunRow from '$lib/runs/RunRow.svelte';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
  let runs = $state.raw<RunSummary[]>(untrack(() => data.runs));
  let nextCursor = $state<string | null>(untrack(() => data.nextCursor));
  let query = $state(untrack(() => data.query));
  let activeFilter = $state(untrack(() => data.state[0].toUpperCase() + data.state.slice(1)));
  let loadingMore = $state(false);
  let loadError = $state('');
  let queryTimer: ReturnType<typeof setTimeout> | undefined;
  let listGeneration = 0;

  $effect(() => {
    runs = [...data.runs];
    nextCursor = data.nextCursor;
    query = data.query;
    activeFilter = data.state[0].toUpperCase() + data.state.slice(1);
    loadingMore = false;
    loadError = '';
    listGeneration += 1;
    clearTimeout(queryTimer);
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
    const generation = listGeneration;
    const cursor = nextCursor;
    loadingMore = true;
    loadError = '';
    try {
      const result = await api<{ runs: RunSummary[]; nextCursor: string | null }>(
        `/runs?limit=30&state=${activeFilter.toLowerCase()}&q=${encodeURIComponent(query.trim())}&cursor=${encodeURIComponent(cursor)}`
      );
      if (generation !== listGeneration) return;
      const ids = new Set(runs.map((run) => run.id));
      runs = [...runs, ...result.runs.filter((run) => !ids.has(run.id))];
      nextCursor = result.nextCursor;
    } catch (cause) {
      if (generation === listGeneration)
        loadError = cause instanceof MarlApiError ? cause.message : 'More runs could not be loaded.';
    } finally {
      if (generation === listGeneration) loadingMore = false;
    }
  }
  onDestroy(() => clearTimeout(queryTimer));
</script>

<svelte:head><title>Runs · Marl</title></svelte:head>

<Page>
  <PageHeader title="Runs" />
  <FilterBar
    placeholder="Search runs"
    tabs={['All', 'Active', 'Success', 'Failure', 'Canceled']}
    bind:active={activeFilter}
    bind:query
    onActiveChange={() => navigate()}
    onQueryChange={changeQuery}
  />
  <section class="surface p-1.5" aria-label="Workflow runs">
    {#each runs as run (run.id)}
      <RunRow {run} />
    {:else}
      <EmptyState
        icon={CirclePlay}
        title={query
          ? 'No matching runs'
          : `No ${activeFilter === 'All' ? '' : activeFilter.toLowerCase() + ' '}runs yet`}
        description={query
          ? 'Try another workflow, repository, branch, or commit.'
          : activeFilter === 'All'
            ? 'Connect a runner and push a workflow to start your first run.'
            : 'Runs will appear here when they reach this state.'}
      >
        {#if !query && activeFilter === 'All'}<LinkButton size="small" variant="primary" href="/runners/new"
            >Connect a runner</LinkButton
          >{/if}
      </EmptyState>
    {/each}
  </section>
  <InfiniteScroll cursor={nextCursor} loading={loadingMore} error={loadError} onload={loadMore} />
</Page>
