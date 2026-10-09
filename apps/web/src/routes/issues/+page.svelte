<script lang="ts">
  import { goto } from '$app/navigation';
  import { onDestroy } from 'svelte';
  import type { IssueSummary } from '@marl/contracts';
  import InfiniteScroll from '#lib/components/feedback/InfiniteScroll.svelte';
  import Page from '#lib/components/page/Page.svelte';
  import FilterBar from '#lib/components/page/FilterBar.svelte';
  import PageHeader from '#lib/components/page/PageHeader.svelte';
  import IssueList from '#lib/issues/IssueList.svelte';
  import IssueViews from '#lib/issues/IssueViews.svelte';
  import { CursorList } from '#lib/ui/cursor-list.svelte.js';
  import { api } from '#lib/api.js';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
  let query = $derived(data.query);
  let active = $derived(data.state[0].toUpperCase() + data.state.slice(1));
  let timer: ReturnType<typeof setTimeout> | undefined;
  const issues = new CursorList(
    () => ({ items: data.issues, nextCursor: data.nextCursor }),
    async (cursor) => {
      const params = new URLSearchParams({ limit: '40', state: data.state, cursor, view: data.view });
      if (data.query) params.set('q', data.query);
      const result = await api<{ issues: IssueSummary[]; nextCursor: string | null }>(`/issues?${params}`);
      return { items: result.issues, nextCursor: result.nextCursor };
    },
    'More issues could not be loaded.'
  );
  function navigate(state = active, value = query, view = data.view) {
    const params = new URLSearchParams({ view });
    if (state.toLowerCase() !== 'open') params.set('state', state.toLowerCase());
    if (value.trim()) params.set('q', value.trim());
    void goto(`/issues${params.size ? `?${params}` : ''}`, { reset: false, replace: true });
  }
  function changeQuery(value: string) {
    clearTimeout(timer);
    timer = setTimeout(() => navigate(active, value), 220);
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
    issues={issues.items}
    showRepository
    emptyTitle={data.view !== 'all'
      ? `No ${data.view} discussions`
      : query
        ? 'No matching issues'
        : `No ${active.toLowerCase()} issues`}
    emptyDescription={query ? 'Try another search.' : 'Issues from repositories you can access will appear here.'}
  />
  <InfiniteScroll list={issues} />
</Page>
