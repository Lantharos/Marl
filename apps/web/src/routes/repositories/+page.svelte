<script lang="ts">
  import { goto } from '$app/navigation';
  import { untrack } from 'svelte';
  import type { RepositorySummary } from '@marl/contracts';
  import Lock from 'lucide-svelte/icons/lock';
  import { api } from '$lib/api';
  import FilterBar from '$lib/components/FilterBar.svelte';
  import PageHeader from '$lib/components/PageHeader.svelte';
  import Time from '$lib/components/Time.svelte';
  import RepositoryIcon from '$lib/components/RepositoryIcon.svelte';
  import type { PageData } from './$types';

  let { data } = $props<{ data: PageData }>();
  let items = $state<RepositorySummary[]>(untrack(() => data.repositories));
  let nextCursor = $state<string | null>(untrack(() => data.nextCursor));
  let query = $state(untrack(() => data.query));
  let activeFilter = $state(untrack(() => data.visibility[0].toUpperCase() + data.visibility.slice(1)));
  let loadingMore = $state(false);
  let queryTimer: ReturnType<typeof setTimeout> | undefined;

  $effect(() => {
    items = [...data.repositories];
    nextCursor = data.nextCursor;
    query = data.query;
    activeFilter = data.visibility[0].toUpperCase() + data.visibility.slice(1);
  });

  function navigate(visibility = activeFilter, value = query) {
    const params = new URLSearchParams();
    if (visibility.toLowerCase() !== 'all') params.set('visibility', visibility.toLowerCase());
    if (value.trim()) params.set('q', value.trim());
    void goto(`/repositories${params.size ? `?${params}` : ''}`, { keepFocus: true, noScroll: true, replaceState: true });
  }

  function changeQuery(value: string) {
    clearTimeout(queryTimer);
    queryTimer = setTimeout(() => navigate(activeFilter, value), 220);
  }

  async function loadMore() {
    if (!nextCursor || loadingMore) return;
    loadingMore = true;
    const result = await api<{ repositories: RepositorySummary[]; nextCursor: string | null }>(`/repositories?limit=30&visibility=${activeFilter.toLowerCase()}&q=${encodeURIComponent(query.trim())}&cursor=${encodeURIComponent(nextCursor)}`);
    items = [...items, ...result.repositories];
    nextCursor = result.nextCursor;
    loadingMore = false;
  }
</script>

<svelte:head><title>Repositories · Marl</title></svelte:head>

<main class="page">
  <PageHeader title="Repositories" description="The projects you own and collaborate on." actionHref="/repositories/new" actionLabel="New repository" />
  <FilterBar placeholder="Find a repository" tabs={['All', 'Public', 'Private']} bind:active={activeFilter} bind:query onActiveChange={() => navigate()} onQueryChange={changeQuery} />
  <section class="list" aria-label="Repositories">
    {#each items as repository}
      <a class="row" href="/{repository.owner}/{repository.name}">
        <RepositoryIcon name={repository.name} src={repository.iconUrl} size={36} />
        <span class="main">
          <strong><i>{repository.owner}/</i>{repository.name}{#if repository.visibility === 'private'}<Lock size={12} aria-label="Private repository" />{/if}</strong>
          <p>{repository.description || 'No description yet.'}</p>
        </span>
        <Time value={repository.updatedAt} />
      </a>
    {:else}
      <div class="empty">
        <strong>{query ? 'No matching repositories' : `No ${activeFilter === 'All' ? '' : activeFilter.toLowerCase() + ' '}repositories`}</strong>
        <p>{query ? 'Try a different owner, name, or description.' : 'Create a repository to start hosting code in Marl.'}</p>
        {#if !query}<a href="/repositories/new">New repository</a>{/if}
      </div>
    {/each}
  </section>
  {#if nextCursor}<button class="load-more" disabled={loadingMore} onclick={loadMore}>{loadingMore ? 'Loading…' : 'Load more'}</button>{/if}
</main>

<style>
  .page{width:min(1080px,calc(100% - 56px));margin:0 auto;padding:48px 0 72px}.row{display:grid;grid-template-columns:40px minmax(0,1fr) auto;align-items:center;gap:14px;min-height:88px;padding:12px 5px;border-bottom:1px solid var(--border-subtle);color:inherit;text-decoration:none}.row:hover{background:var(--surface-hover)}.main{min-width:0}.main strong{display:inline-flex;align-items:center;gap:5px;color:var(--text-strong);font-size:14px;font-weight:650}.main strong i{color:var(--text-muted);font-style:normal;font-weight:500}.main strong :global(svg){color:var(--text-faint)}.main p{overflow:hidden;margin:5px 0;color:var(--text);font-size:12px;text-overflow:ellipsis;white-space:nowrap}.row :global(time){font-size:12px}.empty{padding:68px 4px;color:var(--text-muted);text-align:center}.empty strong{color:var(--text-strong);font-size:15px}.empty p{margin:7px 0 0;font-size:12px}.empty a{display:inline-flex;margin-top:15px;color:var(--brand-strong);font-size:12px;text-decoration:none}.load-more{display:block;height:36px;margin:18px auto 0;padding:0 14px;border:1px solid var(--border);border-radius:6px;background:var(--surface);color:var(--text);cursor:pointer;font-size:12px}@media(max-width:680px){.page{width:calc(100% - 28px);padding-top:32px}}
</style>
