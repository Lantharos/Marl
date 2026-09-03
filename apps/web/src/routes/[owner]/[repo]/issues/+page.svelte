<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { onDestroy, untrack } from 'svelte';
  import type { IssueSummary } from '@marl/contracts';
  import Button from '$lib/components/Button.svelte';
  import FilterBar from '$lib/components/FilterBar.svelte';
  import PageHeader from '$lib/components/PageHeader.svelte';
  import Seo from '$lib/components/Seo.svelte';
  import IssueList from '$lib/issues/IssueList.svelte';
  import { api, MarlApiError } from '$lib/api';
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
  let loadError = $state('');
  let timer: ReturnType<typeof setTimeout> | undefined;
  let listGeneration = 0;
  $effect(() => { issues = data.issues; nextCursor = data.nextCursor; query = data.query; active = data.state[0].toUpperCase() + data.state.slice(1); selectedLabels = [...data.labels]; loading = false; loadError = ''; listGeneration += 1; clearTimeout(timer); });
  function navigate(state = active, value = query, labels = selectedLabels) { const params = new URLSearchParams(); if (state.toLowerCase() !== 'open') params.set('state', state.toLowerCase()); if (value.trim()) params.set('q', value.trim()); for (const label of labels) params.append('label', label); void goto(`/${owner}/${repo}/issues${params.size ? `?${params}` : ''}`, { keepFocus: true, noScroll: true, replaceState: true }); }
  function changeQuery(value: string) { clearTimeout(timer); timer = setTimeout(() => navigate(active, value), 220); }
  async function loadMore() { if (!nextCursor || loading) return; const generation = listGeneration; const cursor = nextCursor; const route = { owner, repo }; loading = true; loadError = ''; try { const params = new URLSearchParams({ limit: '30', state: active.toLowerCase(), cursor }); if (query.trim()) params.set('q', query.trim()); for (const label of selectedLabels) params.append('label', label); const result = await api<{ issues: IssueSummary[]; nextCursor: string | null }>(`/repositories/${route.owner}/${route.repo}/issues?${params}`); if (generation !== listGeneration || owner !== route.owner || repo !== route.repo) return; const ids = new Set(issues.map((issue) => issue.id)); issues = [...issues, ...result.issues.filter((issue) => !ids.has(issue.id))]; nextCursor = result.nextCursor; } catch (cause) { if (generation === listGeneration) loadError = cause instanceof MarlApiError ? cause.message : 'More issues could not be loaded.'; } finally { if (generation === listGeneration) loading = false; } }
  onDestroy(() => clearTimeout(timer));
</script>

<Seo title={`Issues · ${owner}/${repo} · Marl`} description={`Track bugs, ideas, and project work for ${owner}/${repo} on Marl.`} path={$page.url.pathname} robots={data.repository.visibility === 'public' ? 'index, follow' : 'noindex, nofollow'} />
<div class="page">
  <PageHeader title="Issues" description="Turn questions and proposals into owned work." actionHref={data.shellUser ? `/issues/new?repository=${owner}/${repo}` : undefined} actionLabel={data.shellUser ? 'New issue' : undefined} />
  <FilterBar placeholder="Search issues" tabs={['Open', 'Closed', 'All']} labelOptions={data.availableLabels} bind:active bind:query bind:selectedLabels onActiveChange={() => navigate()} onQueryChange={changeQuery} onLabelsChange={(labels) => navigate(active, query, labels)} />
  <IssueList {issues} grouped={active === 'Open'} emptyTitle={query || selectedLabels.length ? 'No matching issues' : `No ${active.toLowerCase()} issues`} emptyDescription={query || selectedLabels.length ? 'Try another search or remove a label filter.' : 'New issues will appear here.'} />
  {#if loadError}<p class="load-error" role="alert">{loadError}</p>{/if}
  {#if nextCursor}<Button class="load" loading={loading} onclick={loadMore}>Load more</Button>{/if}
</div>
<style>.page{width:min(1040px,100%);margin:0 auto}.load-error{margin:16px 0 0;color:var(--danger);font-size:10px;text-align:center}.page :global(.load.button){display:flex;margin:20px auto 0}</style>
