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
  import Button from '$lib/components/Button.svelte';
  import PageHeader from '$lib/components/PageHeader.svelte';
  import Time from '$lib/components/Time.svelte';
  import type { PageData } from './$types';
  import { api } from '$lib/api';

  let { data } = $props<{ data: PageData }>();
  let items = $state<PullRequestSummary[]>(untrack(() => data.pullRequests));
  let nextCursor = $state<string | null>(untrack(() => data.nextCursor));
  let query = $state(untrack(() => data.query));
  let activeFilter = $state(untrack(() => data.state[0].toUpperCase() + data.state.slice(1)));
  let selectedLabels = $state<string[]>(untrack(() => data.labels));
  let loadingMore = $state(false);
  let queryTimer: ReturnType<typeof setTimeout> | undefined;

  $effect(() => {
    items = [...data.pullRequests];
    nextCursor = data.nextCursor;
    query = data.query;
    activeFilter = data.state[0].toUpperCase() + data.state.slice(1);
    selectedLabels = [...data.labels];
  });

  function navigate(state = activeFilter, value = query, labels = selectedLabels) {
    const params = new URLSearchParams();
    if (state.toLowerCase() !== 'open') params.set('state', state.toLowerCase());
    if (value.trim()) params.set('q', value.trim());
    for (const label of labels) params.append('label', label);
    void goto(`/pulls${params.size ? `?${params}` : ''}`, { keepFocus: true, noScroll: true, replaceState: true });
  }

  function changeQuery(value: string) {
    clearTimeout(queryTimer);
    queryTimer = setTimeout(() => navigate(activeFilter, value), 220);
  }

  async function loadMore() {
    if (!nextCursor || loadingMore) return;
    loadingMore = true;
    const params = new URLSearchParams({ limit: '30', state: activeFilter.toLowerCase(), cursor: nextCursor });
    if (query.trim()) params.set('q', query.trim());
    for (const label of selectedLabels) params.append('label', label);
    const result = await api<{ pullRequests: PullRequestSummary[]; nextCursor: string | null }>(`/pulls?${params}`);
    items = [...items, ...result.pullRequests];
    nextCursor = result.nextCursor;
    loadingMore = false;
  }
</script>

<svelte:head><title>Pull requests · Marl</title></svelte:head>
<main class="page">
  <PageHeader title="Pull requests" description="Review, unblock, and ship changes from one queue." actionHref="/pulls/new" actionLabel="New pull request" />
  <FilterBar placeholder="Search pull requests" tabs={['Open', 'Merged', 'Closed']} labelOptions={data.availableLabels} bind:active={activeFilter} bind:query bind:selectedLabels onActiveChange={() => navigate()} onQueryChange={changeQuery} onLabelsChange={(labels) => navigate(activeFilter, query, labels)} />
  <section class="list" aria-label="Pull requests">
    {#each items as pull (pull.id)}
      <article class="row">
        <span class:blocked={pull.state === 'blocked'} class:ready={pull.state === 'mergeable'} class:merged={pull.state === 'merged'} class:closed={pull.state === 'closed'} class="state">{#if pull.state === 'merged'}<GitMerge size={17} />{:else if pull.state === 'closed'}<GitPullRequestClosed size={17} />{:else}<GitPullRequest size={17} />{/if}</span>
        <span class="main"><span class="title-line"><a class="title-link" href="/{pull.repository.owner}/{pull.repository.name}/pulls/{pull.number}">{pull.title}</a>{#if pull.labels.length}<span class="labels">{#each pull.labels.slice(0, 3) as label (label.id)}<span class="label" style:--label-color={label.color}>{label.name}</span>{/each}{#if pull.labels.length > 3}<span class="more-labels">+{pull.labels.length - 3}</span>{/if}</span>{/if}</span><small>{pull.repository.owner}/{pull.repository.name} !{pull.number} opened by <a class="author-link" href="/{pull.author}">{pull.authorDisplayName}</a> · <Time value={pull.updatedAt} /></small><span class="details"><code>{pull.sourceBranch}<ArrowRight size={11} />{pull.targetBranch}</code><span class="checks" class:failed={pull.checkSummary.failed > 0} class:empty-checks={pull.checkSummary.total === 0} class:running={pull.checkSummary.running > 0}>{#if pull.checkSummary.failed}<CircleAlert size={12} />{pull.checkSummary.failed} failed{:else if pull.checkSummary.running}<CircleDot size={12} />{pull.checkSummary.running} running{:else if pull.checkSummary.total === 0}<CircleDot size={12} />No checks{:else}<CircleCheck size={12} />{pull.checkSummary.passed}/{pull.checkSummary.total} passed{/if}</span></span></span>
        <span class="review">{#if pull.reviewStatus === 'approved'}<CircleCheck size={14} />Approved{:else if pull.reviewStatus === 'changes_requested'}<CircleAlert size={14} />Changes requested{:else}<CircleDot size={14} />Review requested{/if}</span>
      </article>
    {:else}<div class="empty"><GitPullRequest size={24} /><strong>{query ? 'No matching pull requests' : `No ${activeFilter.toLowerCase()} pull requests`}</strong><p>{query ? 'Try a different title, branch, author, or repository.' : activeFilter === 'Open' ? 'Create a pull request when a branch is ready for review.' : `Pull requests will appear here after they are ${activeFilter.toLowerCase()}.`}</p>{#if !query && activeFilter === 'Open'}<a href="/pulls/new">New pull request</a>{/if}</div>{/each}
  </section>
  {#if nextCursor}<Button class="load-more" loading={loadingMore} onclick={loadMore}>Load more</Button>{/if}
</main>

<style>
  .page{width:min(920px,calc(100% - 48px));margin:0 auto;padding:44px 0 72px}.list{display:grid;gap:4px}.empty{padding:70px 20px;color:var(--text-muted);text-align:center}.empty strong{display:block;margin-top:10px;color:var(--text-strong);font-size:15px}.empty p{margin:7px auto 0;max-width:420px;font-size:12px}.empty a{display:inline-flex;margin-top:16px;color:var(--brand-strong);font-size:12px;text-decoration:none}.row{position:relative;display:grid;grid-template-columns:36px minmax(0,1fr) 140px;align-items:center;gap:12px;min-height:84px;padding:11px 12px;border-radius:8px;color:inherit;transition:background-color 120ms ease}.row:hover{background:var(--surface-hover)}.state{display:grid;width:32px;height:32px;place-items:center;border-radius:8px;background:var(--brand-soft);color:var(--brand)}.state.blocked,.state.closed{background:var(--danger-soft);color:var(--danger)}.state.ready{background:var(--success-soft);color:var(--success)}.state.merged{background:color-mix(in srgb,#8b5cf6 18%,transparent);color:#a78bfa}.main{min-width:0}.title-line{display:flex;min-width:0;align-items:center;gap:6px}.main .title-link,.main>small{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.main .title-link{min-width:0;color:var(--text-strong);font-size:13px;font-weight:640;text-decoration:none}.main .title-link::after{position:absolute;z-index:0;inset:0;content:''}.main>small{margin-top:4px;color:var(--text-muted);font-size:10px}.main .author-link{position:relative;z-index:1;color:var(--text-strong);text-decoration:none}.main .author-link:hover{color:var(--brand)}.labels{position:relative;z-index:1;display:flex;min-width:0;align-items:center;gap:5px;overflow:hidden}.details{display:flex;min-width:0;align-items:center;gap:6px;margin-top:6px}.main code{display:flex;align-items:center;gap:5px;color:var(--text-muted);font-size:9px;white-space:nowrap}.label{flex:none;padding:3px 6px;border-radius:999px;background:color-mix(in srgb,var(--label-color) 14%,transparent);color:var(--label-color);font-size:8px;font-weight:650}.more-labels{flex:none;color:var(--text-faint);font-size:8px}.review,.checks{display:inline-flex;align-items:center;gap:5px;color:var(--text-muted);font-size:10px;font-weight:580}.checks{color:var(--success);font-size:9px;white-space:nowrap}.checks.failed{color:var(--danger)}.checks.running{color:var(--warning)}.checks.empty-checks{color:var(--text-muted)}.page :global(.load-more.button){display:flex;margin:18px auto 0}@media(max-width:760px){.page{width:calc(100% - 28px);padding-top:28px}.row{grid-template-columns:36px minmax(0,1fr);padding-inline:6px}.review{display:none}.labels{display:none}}
</style>
