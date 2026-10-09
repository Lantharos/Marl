<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { onDestroy } from 'svelte';
  import type { PullRequestSummary } from '@marl/contracts';
  import InfiniteScroll from '#lib/components/feedback/InfiniteScroll.svelte';
  import FilterBar from '#lib/components/page/FilterBar.svelte';
  import PageHeader from '#lib/components/page/PageHeader.svelte';
  import Seo from '#lib/components/page/Seo.svelte';
  import PullQueue from '#lib/pulls/list/PullQueue.svelte';
  import { CursorList } from '#lib/ui/cursor-list.svelte.js';
  import { api } from '#lib/api.js';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
  const owner = $derived(page.params.owner);
  const repo = $derived(page.params.repo);
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
      const result = await api<{ pullRequests: PullRequestSummary[]; nextCursor: string | null }>(
        `/repositories/${data.repository.owner}/${data.repository.name}/pulls?${params}`
      );
      return { items: result.pullRequests, nextCursor: result.nextCursor };
    },
    'More pulls could not be loaded.'
  );

  function navigate(state = activeFilter, value = query, labels = selectedLabels) {
    const params = new URLSearchParams();
    if (state.toLowerCase() !== 'open') params.set('state', state.toLowerCase());
    if (value.trim()) params.set('q', value.trim());
    for (const label of labels) params.append('label', label);
    void goto(`/${owner}/${repo}/pulls${params.size ? `?${params}` : ''}`, {
      reset: false,
      replace: true
    });
  }

  function changeQuery(value: string) {
    clearTimeout(queryTimer);
    queryTimer = setTimeout(() => navigate(activeFilter, value), 220);
  }
  function clearFilters() {
    clearTimeout(queryTimer);
    query = '';
    selectedLabels = [];
    navigate(activeFilter, '', []);
  }
  onDestroy(() => clearTimeout(queryTimer));
</script>

<Seo
  title={`Pulls · ${owner}/${repo} · Marl`}
  description={`Review proposed changes, discussion, and merge state for ${owner}/${repo} on Marl.`}
  path={page.url.pathname}
  robots={data.repository.visibility === 'public' ? 'index, follow' : 'noindex, nofollow'}
/>
<PageHeader
  title="Pulls"
  actionHref={data.shellUser
    ? data.repository.upstream
      ? `/pulls/new?repository=${data.repository.upstream.owner}/${data.repository.upstream.name}&sourceRepository=${owner}/${repo}`
      : `/pulls/new?repository=${owner}/${repo}`
    : undefined}
  actionLabel={data.shellUser ? (data.repository.upstream ? 'Contribute upstream' : 'New pull') : undefined}
/>
<FilterBar
  placeholder="Search this repository"
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
  grouped={activeFilter === 'Open'}
  emptyTitle={data.query || data.labels.length ? 'No matching pulls' : `No ${activeFilter.toLowerCase()} pulls`}
  emptyDescription={data.query || data.labels.length
    ? 'Try another search or remove a label filter.'
    : 'Changes proposed to this repository will appear here.'}
  onClearFilters={data.query || data.labels.length ? clearFilters : undefined}
/>
<InfiniteScroll list={pulls} />
