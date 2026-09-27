<script lang="ts">
  import { goto } from '$app/navigation';
  import { onDestroy, untrack } from 'svelte';
  import type { IssueSummary } from '@marl/contracts';
  import InfiniteScroll from '$lib/components/feedback/InfiniteScroll.svelte';
  import Page from '$lib/components/page/Page.svelte';
  import FilterBar from '$lib/components/page/FilterBar.svelte';
  import PageHeader from '$lib/components/page/PageHeader.svelte';
  import IssueList from '$lib/issues/IssueList.svelte';
  import IssueViews from '$lib/issues/IssueViews.svelte';
  import { api, MarlApiError } from '$lib/api';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
  let issues = $state.raw<IssueSummary[]>(untrack(() => data.issues));
  let nextCursor = $state<string | null>(untrack(() => data.nextCursor));
  let query = $state(untrack(() => data.query));
  let active = $state(untrack(() => data.state[0].toUpperCase() + data.state.slice(1)));
  let loading = $state(false);
  let loadError = $state('');
  let timer: ReturnType<typeof setTimeout> | undefined;
  let listGeneration = 0;
  $effect(() => {
    issues = data.issues;
    nextCursor = data.nextCursor;
    query = data.query;
    active = data.state[0].toUpperCase() + data.state.slice(1);
    loading = false;
    loadError = '';
    listGeneration += 1;
    clearTimeout(timer);
  });
  function navigate(state = active, value = query, view = data.view) {
    const params = new URLSearchParams({ view });
    if (state.toLowerCase() !== 'open') params.set('state', state.toLowerCase());
    if (value.trim()) params.set('q', value.trim());
    void goto(`/issues${params.size ? `?${params}` : ''}`, { keepFocus: true, noScroll: true, replaceState: true });
  }
  function changeQuery(value: string) {
    clearTimeout(timer);
    timer = setTimeout(() => navigate(active, value), 220);
  }
  async function loadMore() {
    if (!nextCursor || loading) return;
    const generation = listGeneration;
    const cursor = nextCursor;
    loading = true;
    loadError = '';
    try {
      const params = new URLSearchParams({ limit: '40', state: active.toLowerCase(), cursor, view: data.view });
      if (query.trim()) params.set('q', query.trim());
      const result = await api<{ issues: IssueSummary[]; nextCursor: string | null }>(`/issues?${params}`);
      if (generation !== listGeneration) return;
      const ids = new Set(issues.map((issue) => issue.id));
      issues = [...issues, ...result.issues.filter((issue) => !ids.has(issue.id))];
      nextCursor = result.nextCursor;
    } catch (cause) {
      if (generation === listGeneration)
        loadError = cause instanceof MarlApiError ? cause.message : 'More issues could not be loaded.';
    } finally {
      if (generation === listGeneration) loading = false;
    }
  }
  onDestroy(() => clearTimeout(timer));
</script>

<svelte:head><title>Issues · Marl</title></svelte:head>
<Page>
  <PageHeader title="Issues" actionHref="/issues/new" actionLabel="New issue" />
  <FilterBar
    placeholder="Search issues"
    tabs={['Open', 'Closed', 'All']}
    bind:active
    bind:query
    onActiveChange={() => navigate()}
    onQueryChange={changeQuery}
  />
  <IssueViews value={data.view} personal onChange={(view) => navigate(active, query, view)} />
  <IssueList
    {issues}
    showRepository
    emptyTitle={data.view !== 'all'
      ? `No ${data.view} discussions`
      : query
        ? 'No matching issues'
        : `No ${active.toLowerCase()} issues`}
    emptyDescription={query ? 'Try another search.' : 'Issues from repositories you can access will appear here.'}
  />
  <InfiniteScroll cursor={nextCursor} {loading} error={loadError} onload={loadMore} />
</Page>
