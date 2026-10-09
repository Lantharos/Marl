<script lang="ts">
  import { goto } from '$app/navigation';
  import { onDestroy } from 'svelte';
  import type { PullRequestSummary } from '@marl/contracts';
  import FilterBar from '#lib/components/page/FilterBar.svelte';
  import InfiniteScroll from '#lib/components/feedback/InfiniteScroll.svelte';
  import Page from '#lib/components/page/Page.svelte';
  import PageHeader from '#lib/components/page/PageHeader.svelte';
  import PullQueue from '#lib/pulls/PullQueue.svelte';
  import { CursorList } from '#lib/ui/cursor-list.svelte.js';
  import type { PageData } from './$types';
  import { api } from '#lib/api.js';

  let { data }: { data: PageData } = $props();
  let query = $derived(data.query);
  let activeFilter = $derived(data.state[0].toUpperCase() + data.state.slice(1));
  let selectedLabels = $derived([...data.labels]);
  let queryTimer: ReturnType<typeof setTimeout> | undefined;
  const pulls = new CursorList(
    () => ({ items: data.pullRequests, nextCursor: data.nextCursor }),
    async (cursor) => {
      const params = new URLSearchParams({ limit: '30', state: data.state, cursor });
      if (data.query) params.set('q', data.query);
      for (const label of data.labels) params.append('label', label);
      const result = await api<{ pullRequests: PullRequestSummary[]; nextCursor: string | null }>(`/pulls?${params}`);
      return { items: result.pullRequests, nextCursor: result.nextCursor };
    },
    'More pulls could not be loaded.'
  );

  function navigate(state = activeFilter, value = query, labels = selectedLabels) {
    const params = new URLSearchParams();
    if (state.toLowerCase() !== 'open') params.set('state', state.toLowerCase());
    if (value.trim()) params.set('q', value.trim());
    for (const label of labels) params.append('label', label);
    void goto(`/pulls${params.size ? `?${params}` : ''}`, { reset: false, replace: true });
  }

  function changeQuery(value: string) {
    clearTimeout(queryTimer);
    queryTimer = setTimeout(() => navigate(activeFilter, value), 220);
  }
  onDestroy(() => clearTimeout(queryTimer));
</script>

<svelte:head><title>Pulls · Marl</title></svelte:head>
<Page>
  <PageHeader title="Pulls" actionHref="/pulls/new" actionLabel="New pull" />
  <FilterBar
    placeholder="Search pulls"
    tabs={['Open', 'Merged', 'Closed']}
    labelOptions={data.availableLabels}
    bind:active={activeFilter}
    bind:query
    bind:selectedLabels
    onActiveChange={() => navigate()}
    onQueryChange={changeQuery}
    onLabelsChange={(labels) => navigate(activeFilter, query, labels)}
  />
  <PullQueue
    pulls={pulls.items}
    showRepository
    grouped={activeFilter === 'Open'}
    emptyTitle={query ? 'No matching pulls' : `No ${activeFilter.toLowerCase()} pulls`}
    emptyDescription={query
      ? 'Try a different title, branch, author, or repository.'
      : activeFilter === 'Open'
        ? 'Open a pull when a change is ready to move through review.'
        : `Pulls will appear here after they are ${activeFilter.toLowerCase()}.`}
    createHref={!query && activeFilter === 'Open' ? '/pulls/new' : undefined}
  />
  <InfiniteScroll list={pulls} />
</Page>
