<script lang="ts">
  import { goto } from '$app/navigation';
  import { onDestroy } from 'svelte';
  import type { RunSummary } from '@marl/contracts';
  import CirclePlay from '@lucide/svelte/icons/circle-play';
  import { api } from '#lib/api.js';
  import LinkButton from '#lib/components/controls/LinkButton.svelte';
  import EmptyState from '#lib/components/feedback/EmptyState.svelte';
  import InfiniteScroll from '#lib/components/feedback/InfiniteScroll.svelte';
  import Page from '#lib/components/page/Page.svelte';
  import FilterBar from '#lib/components/page/FilterBar.svelte';
  import PageHeader from '#lib/components/page/PageHeader.svelte';
  import RunRow from '#lib/runs/RunRow.svelte';
  import { CursorList } from '#lib/ui/cursor-list.svelte.js';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
  let query = $derived(data.query);
  let activeFilter = $derived(data.state[0].toUpperCase() + data.state.slice(1));
  let queryTimer: ReturnType<typeof setTimeout> | undefined;
  const runs = new CursorList(
    () => ({ items: data.runs, nextCursor: data.nextCursor }),
    async (cursor) => {
      const params = new URLSearchParams({ limit: '30', state: data.state, q: data.query, cursor });
      const result = await api<{ runs: RunSummary[]; nextCursor: string | null }>(`/runs?${params}`);
      return { items: result.runs, nextCursor: result.nextCursor };
    },
    'More runs could not be loaded.'
  );

  function navigate(state = activeFilter, value = query) {
    const params = new URLSearchParams();
    if (state.toLowerCase() !== 'all') params.set('state', state.toLowerCase());
    if (value.trim()) params.set('q', value.trim());
    void goto(`/runs${params.size ? `?${params}` : ''}`, { reset: false, replace: true });
  }

  function changeQuery(value: string) {
    clearTimeout(queryTimer);
    queryTimer = setTimeout(() => navigate(activeFilter, value), 220);
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
    {#each runs.items as run (run.id)}
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
  <InfiniteScroll list={runs} />
</Page>
