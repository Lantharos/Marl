<script lang="ts">
  import { goto } from '$app/navigation';
  import { untrack } from 'svelte';
  import type { PullRequestSummary } from '@marl/contracts';
  import ArrowRight from 'lucide-svelte/icons/arrow-right';
  import CircleAlert from 'lucide-svelte/icons/circle-alert';
  import CircleCheck from 'lucide-svelte/icons/circle-check';
  import CircleDot from 'lucide-svelte/icons/circle-dot';
  import GitMerge from 'lucide-svelte/icons/git-merge';
  import GitPullRequest from 'lucide-svelte/icons/git-pull-request';
  import GitPullRequestClosed from 'lucide-svelte/icons/git-pull-request-closed';
  import FilterBar from '$lib/components/FilterBar.svelte';
  import PageHeader from '$lib/components/PageHeader.svelte';
  import Time from '$lib/components/Time.svelte';
  import type { PageData } from './$types';
  import { api } from '$lib/api';

  let { data } = $props<{ data: PageData }>();
  let items = $state<PullRequestSummary[]>(untrack(() => data.pullRequests));
  let nextCursor = $state<string | null>(untrack(() => data.nextCursor));
  let query = $state(untrack(() => data.query));
  let activeFilter = $state(untrack(() => data.state[0].toUpperCase() + data.state.slice(1)));
  let loadingMore = $state(false);
  let queryTimer: ReturnType<typeof setTimeout> | undefined;

  $effect(() => {
    items = [...data.pullRequests];
    nextCursor = data.nextCursor;
    query = data.query;
    activeFilter = data.state[0].toUpperCase() + data.state.slice(1);
  });

  function navigate(state = activeFilter, value = query) {
    const params = new URLSearchParams();
    if (state.toLowerCase() !== 'open') params.set('state', state.toLowerCase());
    if (value.trim()) params.set('q', value.trim());
    void goto(`/pulls${params.size ? `?${params}` : ''}`, { keepFocus: true, noScroll: true, replaceState: true });
  }

  function changeQuery(value: string) {
    clearTimeout(queryTimer);
    queryTimer = setTimeout(() => navigate(activeFilter, value), 220);
  }

  async function loadMore() {
    if (!nextCursor || loadingMore) return;
    loadingMore = true;
    const result = await api<{ pullRequests: PullRequestSummary[]; nextCursor: string | null }>(`/pulls?limit=30&state=${activeFilter.toLowerCase()}&q=${encodeURIComponent(query.trim())}&cursor=${encodeURIComponent(nextCursor)}`);
    items = [...items, ...result.pullRequests];
    nextCursor = result.nextCursor;
    loadingMore = false;
  }
</script>

<svelte:head><title>Pull requests · Marl</title></svelte:head>
<main class="page">
  <PageHeader title="Pull requests" description="Review, unblock, and ship changes from one queue." actionHref="/pulls/new" actionLabel="New pull request" />
  <FilterBar placeholder="Search pull requests" tabs={['Open', 'Merged', 'Closed']} bind:active={activeFilter} bind:query onActiveChange={() => navigate()} onQueryChange={changeQuery} />
  <section class="list" aria-label="Pull requests">
    {#each items as pull}
      <a class="row" href="/{pull.repository.owner}/{pull.repository.name}/pulls/{pull.number}">
        <span class:blocked={pull.state === 'blocked'} class:ready={pull.state === 'mergeable'} class:merged={pull.state === 'merged'} class:closed={pull.state === 'closed'} class="state">{#if pull.state === 'merged'}<GitMerge size={17} />{:else if pull.state === 'closed'}<GitPullRequestClosed size={17} />{:else}<GitPullRequest size={17} />{/if}</span>
        <span class="main"><strong>{pull.title}</strong><small>{pull.repository.owner}/{pull.repository.name} #{pull.number} opened by {pull.author} · <Time value={pull.updatedAt} /></small><code>{pull.sourceBranch}<ArrowRight size={11} />{pull.targetBranch}</code></span>
        <span class="review">{#if pull.reviewStatus === 'approved'}<CircleCheck size={14} />Approved{:else if pull.reviewStatus === 'changes_requested'}<CircleAlert size={14} />Changes requested{:else}<CircleDot size={14} />Review requested{/if}</span>
        <span class="checks" class:failed={pull.checkSummary.failed > 0} class:empty-checks={pull.checkSummary.total === 0}>{#if pull.checkSummary.total === 0}<CircleDot size={14} />No checks{:else}<CircleCheck size={14} />{pull.checkSummary.passed}/{pull.checkSummary.total}{/if}</span>
      </a>
    {:else}<div class="empty"><GitPullRequest size={24} /><strong>{query ? 'No matching pull requests' : `No ${activeFilter.toLowerCase()} pull requests`}</strong><p>{query ? 'Try a different title, branch, author, or repository.' : activeFilter === 'Open' ? 'Create a pull request when a branch is ready for review.' : `Pull requests will appear here after they are ${activeFilter.toLowerCase()}.`}</p>{#if !query && activeFilter === 'Open'}<a href="/pulls/new">New pull request</a>{/if}</div>{/each}
  </section>
  {#if nextCursor}<button class="load-more" disabled={loadingMore} onclick={loadMore}>{loadingMore ? 'Loading…' : 'Load more'}</button>{/if}
</main>

<style>
  .page{width:min(1080px,calc(100% - 64px));margin:0 auto;padding:48px 0 72px}.empty{padding:70px 20px;color:var(--text-muted);text-align:center}.empty strong{display:block;margin-top:10px;color:var(--text-strong);font-size:15px}.empty p{margin:7px auto 0;max-width:420px;font-size:12px}.empty a{display:inline-flex;margin-top:16px;color:var(--brand-strong);font-size:12px;text-decoration:none}.row{display:grid;grid-template-columns:36px minmax(0,1fr) 145px 72px;align-items:center;gap:12px;min-height:84px;padding:12px 5px;border-bottom:1px solid var(--border-subtle);color:inherit;text-decoration:none}.row:hover{background:var(--surface-hover)}.state{display:grid;width:32px;height:32px;place-items:center;border-radius:8px;background:var(--brand-soft);color:var(--brand)}.state.blocked{background:var(--danger-soft);color:var(--danger)}.state.ready{background:var(--success-soft);color:var(--success)}.state.merged{background:color-mix(in srgb,#8b5cf6 18%,transparent);color:#a78bfa}.main{min-width:0}.main strong,.main small{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.main strong{color:var(--text-strong);font-size:14px;font-weight:640}.main small{margin-top:5px;color:var(--text-muted);font-size:12px}.main code{display:flex;align-items:center;gap:5px;margin-top:5px;color:var(--text-muted);font-size:11px}.review,.checks{display:inline-flex;align-items:center;gap:5px;color:var(--text-muted);font-size:12px;font-weight:580}.checks{color:var(--success)}.checks.failed{color:var(--danger)}.checks.empty-checks{color:var(--text-muted)}.load-more{display:block;height:36px;margin:18px auto 0;padding:0 14px;border:1px solid var(--border);border-radius:6px;background:var(--surface);color:var(--text);cursor:pointer;font-size:12px}@media(max-width:760px){.page{width:calc(100% - 28px);padding-top:28px}.row{grid-template-columns:36px minmax(0,1fr) 44px}.review{display:none}}
  .state.closed{background:var(--danger-soft);color:var(--danger)}
</style>
