<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { untrack } from 'svelte';
  import type { IssueSummary } from '@marl/contracts';
  import Button from '$lib/components/Button.svelte';
  import FilterBar from '$lib/components/FilterBar.svelte';
  import PageHeader from '$lib/components/PageHeader.svelte';
  import IssueList from '$lib/issues/IssueList.svelte';
  import { api } from '$lib/api';
  import type { PageData } from './$types';

  let { data } = $props<{ data: PageData }>();
  const owner = $derived($page.params.owner);
  const repo = $derived($page.params.repo);
  let issues = $state.raw<IssueSummary[]>(untrack(() => data.issues));
  let nextCursor = $state<string | null>(untrack(() => data.nextCursor));
  let query = $state(untrack(() => data.query));
  let active = $state(untrack(() => data.state[0].toUpperCase() + data.state.slice(1)));
  let selectedLabels = $state<string[]>(untrack(() => data.labels));
  let loading = $state(false);
  let timer: ReturnType<typeof setTimeout> | undefined;
  $effect(() => { issues = data.issues; nextCursor = data.nextCursor; query = data.query; active = data.state[0].toUpperCase() + data.state.slice(1); selectedLabels = [...data.labels]; });
  function navigate(state = active, value = query, labels = selectedLabels) { const params = new URLSearchParams(); if (state.toLowerCase() !== 'open') params.set('state', state.toLowerCase()); if (value.trim()) params.set('q', value.trim()); for (const label of labels) params.append('label', label); void goto(`/${owner}/${repo}/issues${params.size ? `?${params}` : ''}`, { keepFocus: true, noScroll: true, replaceState: true }); }
  function changeQuery(value: string) { clearTimeout(timer); timer = setTimeout(() => navigate(active, value), 220); }
  async function loadMore() { if (!nextCursor || loading) return; loading = true; try { const params = new URLSearchParams({ limit: '30', state: active.toLowerCase(), cursor: nextCursor }); if (query.trim()) params.set('q', query.trim()); for (const label of selectedLabels) params.append('label', label); const result = await api<{ issues: IssueSummary[]; nextCursor: string | null }>(`/repositories/${owner}/${repo}/issues?${params}`); issues = [...issues, ...result.issues]; nextCursor = result.nextCursor; } finally { loading = false; } }
</script>

<svelte:head><title>Issues · {owner}/{repo} · Marl</title></svelte:head>
<div class="page">
  <PageHeader title="Issues" description="Track bugs, ideas, and work for this repository." actionHref="/issues/new?repository={owner}/{repo}" actionLabel="New issue" />
  <FilterBar placeholder="Search issues" tabs={['Open', 'Closed', 'All']} labelOptions={data.availableLabels} bind:active bind:query bind:selectedLabels onActiveChange={() => navigate()} onQueryChange={changeQuery} onLabelsChange={(labels) => navigate(active, query, labels)} />
  <IssueList {issues} emptyTitle={query || selectedLabels.length ? 'No matching issues' : `No ${active.toLowerCase()} issues`} emptyDescription={query || selectedLabels.length ? 'Try another search or remove a label filter.' : 'New issues will appear here.'} />
  {#if nextCursor}<Button class="load" loading={loading} onclick={loadMore}>Load more</Button>{/if}
</div>
<style>.page{width:min(920px,100%);margin:0 auto}.page :global(.load.button){display:flex;margin:18px auto 0}</style>
