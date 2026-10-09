<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { onDestroy } from 'svelte';
  import type { IssueSummary } from '@marl/contracts';
  import InfiniteScroll from '#lib/components/feedback/InfiniteScroll.svelte';
  import FilterBar from '#lib/components/page/FilterBar.svelte';
  import PageHeader from '#lib/components/page/PageHeader.svelte';
  import Seo from '#lib/components/page/Seo.svelte';
  import IssueList from '#lib/issues/IssueList.svelte';
  import IssueViews from '#lib/issues/IssueViews.svelte';
  import { CursorList } from '#lib/ui/cursor-list.svelte.js';
  import { api } from '#lib/api.js';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
  const owner = $derived(page.params.owner);
  const repo = $derived(page.params.repo);
  let query = $derived(data.query);
  let active = $derived(data.state[0].toUpperCase() + data.state.slice(1));
  let selectedLabels = $derived([...data.labels]);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const issues = new CursorList(
    () => ({ items: data.issues, nextCursor: data.nextCursor }),
    async (cursor) => {
      const params = new URLSearchParams({ limit: '30', state: data.state, cursor, view: data.view });
      if (data.query) params.set('q', data.query);
      for (const label of data.labels) params.append('label', label);
      const result = await api<{ issues: IssueSummary[]; nextCursor: string | null }>(
        `/repositories/${data.repository.owner}/${data.repository.name}/issues?${params}`
      );
      return { items: result.issues, nextCursor: result.nextCursor };
    },
    'More issues could not be loaded.'
  );
  function navigate(state = active, value = query, labels = selectedLabels, view = data.view) {
    const params = new URLSearchParams({ view });
    if (state.toLowerCase() !== 'open') params.set('state', state.toLowerCase());
    if (value.trim()) params.set('q', value.trim());
    for (const label of labels) params.append('label', label);
    void goto(`/${owner}/${repo}/issues${params.size ? `?${params}` : ''}`, {
      reset: false,
      replace: true
    });
  }
  function changeQuery(value: string) {
    clearTimeout(timer);
    timer = setTimeout(() => navigate(active, value), 220);
  }
  onDestroy(() => clearTimeout(timer));
</script>

<Seo
  title={`Issues · ${owner}/${repo} · Marl`}
  description={`Track bugs, ideas, and project work for ${owner}/${repo} on Marl.`}
  path={page.url.pathname}
  robots={data.repository.visibility === 'public' ? 'index, follow' : 'noindex, nofollow'}
/>
<PageHeader
  title="Issues"
  actionHref={data.shellUser ? `/issues/new?repository=${owner}/${repo}` : undefined}
  actionLabel={data.shellUser ? 'New issue' : undefined}
/>
<FilterBar
  placeholder="Search issues"
  tabs={['Open', 'Closed', 'All']}
  labelOptions={data.availableLabels}
  bind:active
  bind:query
  bind:selectedLabels
  onActiveChange={() => navigate()}
  onQueryChange={changeQuery}
  onLabelsChange={(labels) => navigate(active, query, labels)}
/>
<IssueViews
  value={data.view}
  personal={Boolean(data.shellUser)}
  onChange={(view) => navigate(active, query, selectedLabels, view)}
/>
<IssueList
  issues={issues.items}
  emptyTitle={data.view !== 'all'
    ? `No ${data.view} discussions`
    : query || selectedLabels.length
      ? 'No matching issues'
      : `No ${active.toLowerCase()} issues`}
  emptyDescription={query || selectedLabels.length
    ? 'Try another search or remove a label filter.'
    : 'New issues will appear here.'}
/>
<InfiniteScroll list={issues} />
