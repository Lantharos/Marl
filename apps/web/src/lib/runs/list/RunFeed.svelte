<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { onDestroy, type Snippet } from 'svelte';
  import type { RunSummary } from '@marl/contracts';
  import CirclePlay from '@lucide/svelte/icons/circle-play';
  import { api } from '#lib/api.js';
  import EmptyState from '#lib/components/feedback/EmptyState.svelte';
  import InfiniteScroll from '#lib/components/feedback/InfiniteScroll.svelte';
  import List from '#lib/components/list/List.svelte';
  import FilterBar from '#lib/components/page/FilterBar.svelte';
  import { CursorList } from '#lib/ui/cursor-list.svelte.js';
  import { ticking } from '../clock.svelte';
  import RunRow from './RunRow.svelte';
  import { runListPath, runStates, type RunStateFilter } from './run-query';

  let {
    runs: firstRuns,
    nextCursor,
    endpoint,
    state,
    query: initialQuery,
    showRepository = false,
    emptyDescription,
    empty
  }: {
    runs: RunSummary[];
    nextCursor: string | null;
    endpoint: string;
    state: RunStateFilter;
    query: string;
    showRepository?: boolean;
    emptyDescription: string;
    empty?: Snippet;
  } = $props();

  const labels: Record<RunStateFilter, string> = {
    all: 'All',
    active: 'Active',
    success: 'Success',
    failure: 'Failure',
    canceled: 'Canceled'
  };
  let query = $derived(initialQuery);
  let activeLabel = $derived(labels[state]);
  let queryTimer: ReturnType<typeof setTimeout> | undefined;
  const runs = new CursorList(
    () => ({ items: firstRuns, nextCursor }),
    async (cursor) => {
      const result = await api<{ runs: RunSummary[]; nextCursor: string | null }>(
        runListPath(endpoint, { state, query: initialQuery, cursor })
      );
      return { items: result.runs, nextCursor: result.nextCursor };
    },
    'More runs could not be loaded.'
  );
  const now = $derived(ticking(runs.items.some((run) => run.state === 'running')));
  const filtered = $derived(state !== 'all' || Boolean(initialQuery.trim()));

  function navigate(label: string, value: string) {
    const params = new URLSearchParams(page.url.search);
    const next = runStates.find((option) => labels[option] === label) ?? 'all';
    if (next === 'all') params.delete('state');
    else params.set('state', next);
    if (value.trim()) params.set('q', value.trim());
    else params.delete('q');
    void goto(`${page.url.pathname}${params.size ? `?${params}` : ''}`, { reset: false, replace: true });
  }

  function changeQuery(value: string) {
    clearTimeout(queryTimer);
    queryTimer = setTimeout(() => navigate(activeLabel, value), 220);
  }
  onDestroy(() => clearTimeout(queryTimer));
</script>

<FilterBar
  placeholder="Search runs"
  tabs={runStates.map((option) => labels[option])}
  bind:active={activeLabel}
  bind:query
  onActiveChange={(label) => navigate(label, query)}
  onQueryChange={changeQuery}
/>
<List as="section" aria-label="Runs" class="grid gap-px">
  {#each runs.items as run (run.id)}
    <RunRow {run} {showRepository} {now} />
  {:else}
    <EmptyState
      icon={CirclePlay}
      title={filtered ? 'No matching runs' : 'No runs yet'}
      description={filtered ? 'Try another state, workflow, branch, or commit.' : emptyDescription}
      children={filtered ? undefined : empty}
    />
  {/each}
</List>
<InfiniteScroll list={runs} />
