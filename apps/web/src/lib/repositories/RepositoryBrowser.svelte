<script lang="ts">
  import { goto } from '$app/navigation';
  import { onDestroy, untrack } from 'svelte';
  import type { RepositorySummary } from '@marl/contracts';
  import Lock from '@lucide/svelte/icons/lock';
  import { api, MarlApiError } from '$lib/api';
  import FolderGit2 from '@lucide/svelte/icons/folder-git-2';
  import Plus from '@lucide/svelte/icons/plus';
  import RotateCcw from '@lucide/svelte/icons/archive-restore';
  import LinkButton from '$lib/components/controls/LinkButton.svelte';
  import EmptyState from '$lib/components/feedback/EmptyState.svelte';
  import InfiniteScroll from '$lib/components/feedback/InfiniteScroll.svelte';
  import FilterBar from '$lib/components/page/FilterBar.svelte';
  import PageHeader from '$lib/components/page/PageHeader.svelte';
  import Time from '$lib/components/page/Time.svelte';
  import RepositoryIcon from '$lib/components/identity/RepositoryIcon.svelte';
  import BackLink from '$lib/components/page/BackLink.svelte';
  type RepositoryData = {
    repositories: RepositorySummary[];
    nextCursor: string | null;
    query: string;
    visibility: string;
  };

  let {
    data,
    endpoint = '/repositories',
    path = '/repositories',
    owner = '',
    filters = ['All', 'Public', 'Private', 'Archived']
  }: { data: RepositoryData; endpoint?: string; path?: string; owner?: string; filters?: string[] } = $props();
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
      const result = await api<{ repositories: RepositorySummary[]; nextCursor: string | null }>(
        `${endpoint}?limit=30&visibility=${activeFilter.toLowerCase()}&q=${encodeURIComponent(query.trim())}&cursor=${encodeURIComponent(cursor)}`
      );
      if (generation !== listGeneration) return;
      const ids = new Set(items.map((repository) => repository.id));
      items = [...items, ...result.repositories.filter((repository) => !ids.has(repository.id))];
      nextCursor = result.nextCursor;
    } catch (cause) {
      if (generation === listGeneration)
        loadError = cause instanceof MarlApiError ? cause.message : 'More repositories could not be loaded.';
    } finally {
      if (generation === listGeneration) loadingMore = false;
    }
  }
  onDestroy(() => clearTimeout(queryTimer));
</script>

<svelte:head><title>Repositories{owner ? ` · ${owner}` : ''} · Marl</title></svelte:head>

<main class="mx-auto w-full max-w-240 px-4 pt-8 pb-20 sm:px-6 sm:pt-10">
  {#if owner}<div class="mb-4"><BackLink href="/{owner}" label={owner} /></div>{/if}
  <PageHeader title="Repositories">
    {#snippet action()}{#if !owner}<div class="flex gap-2">
          <LinkButton variant="ghost" href="/repositories/deleted"><RotateCcw size={16} />Recently deleted</LinkButton>
          <LinkButton variant="primary" href="/repositories/new"><Plus size={16} />New repository</LinkButton>
        </div>{/if}{/snippet}
  </PageHeader>
  <FilterBar
    placeholder="Find a repository"
    tabs={filters}
    bind:active={activeFilter}
    bind:query
    onActiveChange={() => navigate()}
    onQueryChange={changeQuery}
  />
  <section class="surface p-1.5" aria-label="Repositories">
    {#each items as repository (repository.id)}
      <a
        class="group grid min-h-18 grid-cols-[36px_minmax(0,1fr)_auto] items-center gap-3.5 rounded-lg px-3 py-3 transition-colors hover:bg-surface-hover"
        href="/{repository.owner}/{repository.name}"
      >
        <RepositoryIcon name={repository.name} src={repository.iconUrl} size={36} />
        <span class="min-w-0">
          <strong class="flex min-w-0 items-center gap-1.5 text-base font-semibold text-ink-strong"
            ><span class="truncate"
              ><span class="font-normal text-ink-muted">{repository.owner}</span><span class="mx-0.5 text-ink-faint"
                >/</span
              ><span class="group-hover:text-brand">{repository.name}</span></span
            >{#if repository.visibility === 'private'}<Lock
                size={13}
                class="shrink-0 text-ink-faint"
                aria-label="Private repository"
              />{/if}</strong
          >
          {#if repository.description}<span class="mt-0.5 block truncate text-sm text-ink-muted"
              >{repository.description}</span
            >{/if}
        </span>
        <Time value={repository.updatedAt} class="text-xs text-ink-faint" />
      </a>
    {:else}
      <EmptyState
        icon={FolderGit2}
        title={query
          ? 'No matching repositories'
          : `No ${activeFilter === 'All' ? '' : activeFilter.toLowerCase() + ' '}repositories`}
        description={query
          ? 'Try a different owner, name, or description.'
          : owner
            ? 'No public repositories in this view.'
            : 'Create a repository to start hosting code in Marl.'}
      >
        {#if !query && !owner}<LinkButton variant="primary" size="small" href="/repositories/new"
            ><Plus size={14} />New repository</LinkButton
          >{/if}
      </EmptyState>
    {/each}
  </section>
  <InfiniteScroll cursor={nextCursor} loading={loadingMore} error={loadError} onload={loadMore} />
</main>
