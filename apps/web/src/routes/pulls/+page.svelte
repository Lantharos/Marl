<script lang="ts">
  import { goto } from '$app/navigation';
  import { onDestroy, untrack } from 'svelte';
  import type { PullRequestSummary } from '@marl/contracts';
  import FilterBar from '$lib/components/FilterBar.svelte';
  import Button from '$lib/components/Button.svelte';
  import PageHeader from '$lib/components/PageHeader.svelte';
  import PullQueue from '$lib/pulls/PullQueue.svelte';
  import type { PageData } from './$types';
  import { api, MarlApiError } from '$lib/api';

  let { data } = $props<{ data: PageData }>();
  let items = $state.raw<PullRequestSummary[]>(untrack(() => data.pullRequests));
  let nextCursor = $state<string | null>(untrack(() => data.nextCursor));
  let query = $state(untrack(() => data.query));
  let activeFilter = $state(untrack(() => data.state[0].toUpperCase() + data.state.slice(1)));
  let selectedLabels = $state<string[]>(untrack(() => data.labels));
  let loadingMore = $state(false);
  let loadError = $state('');
  let queryTimer: ReturnType<typeof setTimeout> | undefined;
  let listGeneration = 0;

  $effect(() => {
    items = [...data.pullRequests];
    nextCursor = data.nextCursor;
    query = data.query;
    activeFilter = data.state[0].toUpperCase() + data.state.slice(1);
    selectedLabels = [...data.labels];
    loadingMore = false;
    loadError = '';
    listGeneration += 1;
    clearTimeout(queryTimer);
  });

  function navigate(state = activeFilter, value = query, labels = selectedLabels) {
    const params = new URLSearchParams();
    if (state.toLowerCase() !== 'open') params.set('state', state.toLowerCase());
    if (value.trim()) params.set('q', value.trim());
    for (const label of labels) params.append('label', label);
    void goto(`/pulls${params.size ? `?${params}` : ''}`, { keepFocus: true, noScroll: true, replaceState: true });
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
      const params = new URLSearchParams({ limit: '30', state: activeFilter.toLowerCase(), cursor });
      if (query.trim()) params.set('q', query.trim());
      for (const label of selectedLabels) params.append('label', label);
      const result = await api<{ pullRequests: PullRequestSummary[]; nextCursor: string | null }>(`/pulls?${params}`);
      if (generation !== listGeneration) return;
      const ids = new Set(items.map((pull) => pull.id));
      items = [...items, ...result.pullRequests.filter((pull) => !ids.has(pull.id))];
      nextCursor = result.nextCursor;
    } catch (cause) {
      if (generation === listGeneration) loadError = cause instanceof MarlApiError ? cause.message : 'More pulls could not be loaded.';
    } finally {
      if (generation === listGeneration) loadingMore = false;
    }
  }
  onDestroy(() => clearTimeout(queryTimer));
</script>

<svelte:head><title>Pulls · Marl</title></svelte:head>
<main class="page">
  <PageHeader title="Pulls" description="See the next move, clear blockers, and land changes." actionHref="/pulls/new" actionLabel="New pull" />
  <FilterBar placeholder="Search pulls" tabs={['Open', 'Merged', 'Closed']} labelOptions={data.availableLabels} bind:active={activeFilter} bind:query bind:selectedLabels onActiveChange={() => navigate()} onQueryChange={changeQuery} onLabelsChange={(labels) => navigate(activeFilter, query, labels)} />
  <PullQueue pulls={items} showRepository grouped={activeFilter === 'Open'} emptyTitle={query ? 'No matching pulls' : `No ${activeFilter.toLowerCase()} pulls`} emptyDescription={query ? 'Try a different title, branch, author, or repository.' : activeFilter === 'Open' ? 'Open a pull when a change is ready to move through review.' : `Pulls will appear here after they are ${activeFilter.toLowerCase()}.`} createHref={!query && activeFilter === 'Open' ? '/pulls/new' : undefined} />
  {#if loadError}<p class="load-error" role="alert">{loadError}</p>{/if}
  {#if nextCursor}<Button class="load-more" loading={loadingMore} onclick={loadMore}>Load more</Button>{/if}
</main>

<style>
  .page{width:min(1040px,calc(100% - 48px));margin:0 auto;padding:44px 0 72px}.load-error{margin:16px 0 0;color:var(--danger);font-size:10px;text-align:center}.page :global(.load-more.button){display:flex;margin:20px auto 0}@media(max-width:760px){.page{width:calc(100% - 28px);padding-top:28px}}
</style>
