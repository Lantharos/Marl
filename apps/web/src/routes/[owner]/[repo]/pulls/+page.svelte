<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { onDestroy, untrack } from 'svelte';
  import type { PullRequestSummary } from '@marl/contracts';
  import FilterBar from '$lib/components/FilterBar.svelte';
  import Button from '$lib/components/Button.svelte';
  import PageHeader from '$lib/components/PageHeader.svelte';
  import Seo from '$lib/components/Seo.svelte';
  import PullQueue from '$lib/pulls/PullQueue.svelte';
  import { api, MarlApiError } from '$lib/api';
  import type { PageData } from './$types';

  let { data } = $props<{ data: PageData }>();
  const owner = $derived($page.params.owner);
  const repo = $derived($page.params.repo);
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
    void goto(`/${owner}/${repo}/pulls${params.size ? `?${params}` : ''}`, { keepFocus: true, noScroll: true, replaceState: true });
  }

  function changeQuery(value: string) {
    clearTimeout(queryTimer);
    queryTimer = setTimeout(() => navigate(activeFilter, value), 220);
  }

  async function loadMore() {
    if (!nextCursor || loadingMore) return;
    const generation = listGeneration;
    const cursor = nextCursor;
    const route = { owner, repo };
    loadingMore = true;
    loadError = '';
    try {
      const params = new URLSearchParams({ limit: '30', state: activeFilter.toLowerCase(), cursor });
      if (query.trim()) params.set('q', query.trim());
      for (const label of selectedLabels) params.append('label', label);
      const result = await api<{ pullRequests: PullRequestSummary[]; nextCursor: string | null }>(`/repositories/${route.owner}/${route.repo}/pulls?${params}`);
      if (generation !== listGeneration || owner !== route.owner || repo !== route.repo) return;
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

<Seo title={`Pulls · ${owner}/${repo} · Marl`} description={`Review proposed changes, discussion, and merge state for ${owner}/${repo} on Marl.`} path={$page.url.pathname} robots={data.repository.visibility === 'public' ? 'index, follow' : 'noindex, nofollow'} />
<div class="page">
<PageHeader title="Pulls" description="Move changes from first review to a safe landing." actionHref={data.shellUser ? data.repository?.upstream ? `/pulls/new?repository=${data.repository.upstream.owner}/${data.repository.upstream.name}&sourceRepository=${owner}/${repo}` : `/pulls/new?repository=${owner}/${repo}` : undefined} actionLabel={data.shellUser ? data.repository?.upstream ? 'Contribute upstream' : 'New pull' : undefined} />
<FilterBar placeholder="Search this repository" tabs={['Open', 'Merged', 'Closed']} labelOptions={data.availableLabels} bind:active={activeFilter} bind:query bind:selectedLabels onActiveChange={() => navigate()} onQueryChange={changeQuery} onLabelsChange={(labels) => navigate(activeFilter, query, labels)} />
<PullQueue pulls={items} grouped={activeFilter === 'Open'} emptyTitle={query || selectedLabels.length ? 'No matching pulls' : `No ${activeFilter.toLowerCase()} pulls`} emptyDescription={query || selectedLabels.length ? 'Try another search or remove a label filter.' : 'Changes proposed to this repository will appear here.'} />
{#if loadError}<p class="load-error" role="alert">{loadError}</p>{/if}
{#if nextCursor}<Button class="load-more" loading={loadingMore} onclick={loadMore}>Load more</Button>{/if}
</div>

<style>
  .page{width:min(1040px,100%);margin:0 auto}.load-error{margin:16px 0 0;color:var(--danger);font-size:10px;text-align:center}.page :global(.load-more.button){display:flex;margin:20px auto 0}
</style>
