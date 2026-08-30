<script lang="ts">
  import { goto } from '$app/navigation';
  import { untrack } from 'svelte';
  import type { IssueSummary } from '@marl/contracts';
  import Button from '$lib/components/Button.svelte';
  import FilterBar from '$lib/components/FilterBar.svelte';
  import PageHeader from '$lib/components/PageHeader.svelte';
  import IssueList from '$lib/issues/IssueList.svelte';
  import { api } from '$lib/api';
  import type { PageData } from './$types';

  let { data } = $props<{ data: PageData }>();
  let issues = $state.raw<IssueSummary[]>(untrack(() => data.issues));
  let nextCursor = $state<string | null>(untrack(() => data.nextCursor));
  let query = $state(untrack(() => data.query));
  let active = $state(untrack(() => data.state[0].toUpperCase() + data.state.slice(1)));
  let loading = $state(false);
  let timer: ReturnType<typeof setTimeout> | undefined;
  $effect(() => { issues = data.issues; nextCursor = data.nextCursor; query = data.query; active = data.state[0].toUpperCase() + data.state.slice(1); });
  function navigate(state = active, value = query) { const params = new URLSearchParams(); if (state.toLowerCase() !== 'open') params.set('state', state.toLowerCase()); if (value.trim()) params.set('q', value.trim()); void goto(`/issues${params.size ? `?${params}` : ''}`, { keepFocus: true, noScroll: true, replaceState: true }); }
  function changeQuery(value: string) { clearTimeout(timer); timer = setTimeout(() => navigate(active, value), 220); }
  async function loadMore() { if (!nextCursor || loading) return; loading = true; try { const params = new URLSearchParams({ limit: '40', state: active.toLowerCase(), cursor: nextCursor }); if (query.trim()) params.set('q', query.trim()); const result = await api<{ issues: IssueSummary[]; nextCursor: string | null }>(`/issues?${params}`); issues = [...issues, ...result.issues]; nextCursor = result.nextCursor; } finally { loading = false; } }
</script>

<svelte:head><title>Issues · Marl</title></svelte:head>
<div class="page"><PageHeader title="Issues" description="Work that needs attention across your repositories." actionHref="/issues/new" actionLabel="New issue" /><FilterBar placeholder="Search issues" tabs={['Open', 'Closed', 'All']} bind:active bind:query onActiveChange={() => navigate()} onQueryChange={changeQuery} /><IssueList {issues} showRepository emptyTitle={query ? 'No matching issues' : `No ${active.toLowerCase()} issues`} emptyDescription={query ? 'Try another search.' : 'Issues from repositories you can access will appear here.'} />{#if nextCursor}<Button class="load" loading={loading} onclick={loadMore}>Load more</Button>{/if}</div>
<style>.page{width:min(960px,calc(100% - 48px));margin:0 auto;padding:42px 0 72px}.page :global(.load.button){display:flex;margin:18px auto 0}@media(max-width:680px){.page{width:calc(100% - 28px);padding-top:28px}}</style>
