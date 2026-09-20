<script lang="ts">
  import { goto } from '$app/navigation';
  import { onDestroy, untrack } from 'svelte';
  import type { RepositorySummary } from '@marl/contracts';
  import Lock from 'lucide-svelte/icons/lock';
  import { api, MarlApiError } from '$lib/api';
  import InfiniteScroll from '$lib/components/InfiniteScroll.svelte';
  import FilterBar from '$lib/components/FilterBar.svelte';
  import PageHeader from '$lib/components/PageHeader.svelte';
  import Time from '$lib/components/Time.svelte';
  import RepositoryIcon from '$lib/components/RepositoryIcon.svelte';
  import BackLink from '$lib/components/BackLink.svelte';
  type RepositoryData = { repositories: RepositorySummary[]; nextCursor: string | null; query: string; visibility: string };

  let { data, endpoint = '/repositories', path = '/repositories', owner = '', filters = ['All', 'Public', 'Private', 'Archived'] } = $props<{ data: RepositoryData; endpoint?: string; path?: string; owner?: string; filters?: string[] }>();
  let items = $state.raw<RepositorySummary[]>(untrack(() => data.repositories));
  let nextCursor = $state<string | null>(untrack(() => data.nextCursor));
  let query = $state(untrack(() => data.query));
  let activeFilter = $state(untrack(() => data.visibility[0].toUpperCase() + data.visibility.slice(1)));
  let loadingMore = $state(false);
  let loadError = $state('');
  let queryTimer: ReturnType<typeof setTimeout> | undefined;
  let listGeneration = 0;

  $effect(() => {
    items = [...data.repositories];
    nextCursor = data.nextCursor;
    query = data.query;
    activeFilter = data.visibility[0].toUpperCase() + data.visibility.slice(1);
    loadingMore = false;
    loadError = '';
    listGeneration += 1;
    clearTimeout(queryTimer);
  });

  function navigate(visibility = activeFilter, value = query) {
    const params = new URLSearchParams();
    if (visibility.toLowerCase() !== 'all') params.set('visibility', visibility.toLowerCase());
    if (value.trim()) params.set('q', value.trim());
    void goto(`${path}${params.size ? `?${params}` : ''}`, { keepFocus: true, noScroll: true, replaceState: true });
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
      const result = await api<{ repositories: RepositorySummary[]; nextCursor: string | null }>(`${endpoint}?limit=30&visibility=${activeFilter.toLowerCase()}&q=${encodeURIComponent(query.trim())}&cursor=${encodeURIComponent(cursor)}`);
      if (generation !== listGeneration) return;
      const ids = new Set(items.map((repository) => repository.id));
      items = [...items, ...result.repositories.filter((repository) => !ids.has(repository.id))];
      nextCursor = result.nextCursor;
    } catch (cause) {
      if (generation === listGeneration) loadError = cause instanceof MarlApiError ? cause.message : 'More repositories could not be loaded.';
    } finally {
      if (generation === listGeneration) loadingMore = false;
    }
  }
  onDestroy(() => clearTimeout(queryTimer));
</script>

<svelte:head><title>Repositories{owner ? ` · ${owner}` : ''} · Marl</title></svelte:head>

<main class="page">
  {#if owner}<BackLink href="/{owner}" label={owner} />{/if}
  <PageHeader title="Repositories" />
  <FilterBar placeholder="Find a repository" tabs={filters} bind:active={activeFilter} bind:query onActiveChange={() => navigate()} onQueryChange={changeQuery} />
  <section class="list" aria-label="Repositories">
    {#each items as repository (repository.id)}
      <a class="row" href="/{repository.owner}/{repository.name}">
        <RepositoryIcon name={repository.name} src={repository.iconUrl} size={36} />
        <span class="main">
          <strong><i>{repository.owner}</i><span class="separator">/</span>{repository.name}{#if repository.visibility === 'private'}<Lock size={12} aria-label="Private repository" />{/if}</strong>
          <p>{repository.description || ''}</p>
        </span>
        <Time value={repository.updatedAt} />
      </a>
    {:else}
      <div class="empty">
        <strong>{query ? 'No matching repositories' : `No ${activeFilter === 'All' ? '' : activeFilter.toLowerCase() + ' '}repositories`}</strong>
        <p>{query ? 'Try a different owner, name, or description.' : owner ? 'No public repositories in this view.' : 'Create a repository to start hosting code in Marl.'}</p>
        {#if !query && !owner}<a href="/repositories/new">New repository</a>{/if}
      </div>
    {/each}
  </section>
  <InfiniteScroll cursor={nextCursor} loading={loadingMore} error={loadError} onload={loadMore} />
</main>

<style>
  .page{width:min(920px,calc(100% - 48px));margin:0 auto;padding:44px 0 72px}.list{display:grid;gap:4px;padding:6px;border-radius:12px;background:var(--surface)}.row{display:grid;grid-template-columns:40px minmax(0,1fr) auto;align-items:center;gap:14px;min-height:82px;padding:10px 12px;border-radius:8px;color:inherit;text-decoration:none;transition:background-color 120ms ease}.row:hover{background:var(--surface-hover)}.main{min-width:0}.main strong{display:inline-flex;flex-wrap:wrap;overflow-wrap:anywhere;align-items:center;gap:5px;color:var(--text-strong);font-size:13px;font-weight:650}.main strong i{color:var(--text-muted);font-style:normal;font-weight:500}.main strong .separator{color:var(--text-faint);font-weight:400}.main strong :global(svg){color:var(--text-faint)}.main p:empty{display:none}.main p{overflow:hidden;margin:5px 0;color:var(--text-muted);font-size:12px;text-overflow:ellipsis;white-space:nowrap}.row :global(time){font-size:11px}.empty{padding:68px 4px;color:var(--text-muted);text-align:center}.empty strong{color:var(--text-strong);font-size:15px}.empty p{margin:7px 0 0;font-size:12px}.empty a{display:inline-flex;margin-top:15px;color:var(--brand-strong);font-size:12px;text-decoration:none}@media(max-width:680px){.page{width:calc(100% - 28px);padding-top:32px}.row{padding-inline:6px}}
</style>
