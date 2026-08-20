<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { untrack } from 'svelte';
  import type { PullRequestSummary } from '@marl/contracts';
  import CircleAlert from 'lucide-svelte/icons/circle-alert';
  import CircleCheck from 'lucide-svelte/icons/circle-check';
  import CircleDot from 'lucide-svelte/icons/circle-dot';
  import ArrowRight from 'lucide-svelte/icons/arrow-right';
  import GitMerge from 'lucide-svelte/icons/git-merge';
  import GitPullRequest from 'lucide-svelte/icons/git-pull-request';
  import GitPullRequestClosed from 'lucide-svelte/icons/git-pull-request-closed';
  import FilterBar from '$lib/components/FilterBar.svelte';
  import Button from '$lib/components/Button.svelte';
  import Time from '$lib/components/Time.svelte';
  import { api } from '$lib/api';
  import type { PageData } from './$types';

  let { data } = $props<{ data: PageData }>();
  const owner = $derived($page.params.owner);
  const repo = $derived($page.params.repo);
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
    void goto(`/${owner}/${repo}/pulls${params.size ? `?${params}` : ''}`, { keepFocus: true, noScroll: true, replaceState: true });
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
    const result = await api<{ pullRequests: PullRequestSummary[]; nextCursor: string | null }>(`/repositories/${owner}/${repo}/pulls?${params}`);
    items = [...items, ...result.pullRequests];
    nextCursor = result.nextCursor;
    loadingMore = false;
  }
</script>

<svelte:head><title>Pull requests · {$page.params.owner}/{$page.params.repo} · Marl</title></svelte:head>
<div class="page">
<header class="heading"><div><h1>Pull requests</h1><p>Propose, review, and merge changes to this repository.</p></div><a href={data.repository?.upstream ? `/pulls/new?repository=${data.repository.upstream.owner}/${data.repository.upstream.name}&sourceRepository=${owner}/${repo}` : `/pulls/new?repository=${owner}/${repo}`}>{data.repository?.upstream ? 'Contribute upstream' : 'New pull request'}</a></header>
<FilterBar placeholder="Search this repository" tabs={['Open', 'Merged', 'Closed']} labelOptions={data.availableLabels} bind:active={activeFilter} bind:query bind:selectedLabels onActiveChange={() => navigate()} onQueryChange={changeQuery} onLabelsChange={(labels) => navigate(activeFilter, query, labels)} />
<section class="list">
  {#each items as pull}
    <article class="row">
      <span class:blocked={pull.state === 'blocked'} class:merged={pull.state === 'merged'} class:closed={pull.state === 'closed'} class="icon">{#if pull.state === 'merged'}<GitMerge size={17} />{:else if pull.state === 'closed'}<GitPullRequestClosed size={17} />{:else}<GitPullRequest size={17} />{/if}</span>
      <span class="main"><a class="title-link" href="/{owner}/{repo}/pulls/{pull.number}">{pull.title}</a><small>#{pull.number} opened by <a class="author-link" href="/{pull.author}">{pull.authorDisplayName}</a> · <Time value={pull.updatedAt} /></small><span class="details"><code>{pull.sourceRepository && `${pull.sourceRepository.owner}/${pull.sourceRepository.name}` !== `${owner}/${repo}` ? `${pull.sourceRepository.owner}:${pull.sourceBranch}` : pull.sourceBranch}<ArrowRight size={11} />{pull.targetBranch}</code><span class:failed={pull.checkSummary.failed > 0} class:quiet={pull.checkSummary.total === 0} class:running={pull.checkSummary.running > 0} class="checks">{#if pull.checkSummary.failed}<CircleAlert size={12} />{pull.checkSummary.failed} failed{:else if pull.checkSummary.running}<CircleDot size={12} />{pull.checkSummary.running} running{:else if pull.checkSummary.total === 0}<CircleDot size={12} />No checks{:else}<CircleCheck size={12} />{pull.checkSummary.passed}/{pull.checkSummary.total} passed{/if}</span>{#each pull.labels.slice(0, 3) as label}<span class="label" style:--label-color={label.color}>{label.name}</span>{/each}{#if pull.labels.length > 3}<span class="more-labels">+{pull.labels.length - 3}</span>{/if}</span></span>
    </article>
  {:else}
    <div class="empty"><GitPullRequest size={23} /><strong>{query || selectedLabels.length ? 'No matching pull requests' : `No ${activeFilter.toLowerCase()} pull requests`}</strong><p>{query || selectedLabels.length ? 'Try another search or remove a label filter.' : 'Changes proposed to this repository will appear here.'}</p></div>
  {/each}
</section>
{#if nextCursor}<Button class="load-more" loading={loadingMore} onclick={loadMore}>Load more</Button>{/if}
</div>

<style>
  .page{width:min(920px,100%);margin:0 auto}.heading{display:flex;align-items:flex-end;justify-content:space-between;gap:20px;margin-bottom:24px}.heading h1{margin:0;color:var(--text-strong);font-size:22px;letter-spacing:-.025em}.heading p{margin:6px 0 0;color:var(--text-muted);font-size:12px}.heading>a{display:inline-flex;height:34px;align-items:center;padding:0 12px;border-radius:7px;background:var(--brand);color:white;font-size:11px;font-weight:640;text-decoration:none}.heading>a:hover{background:var(--brand-hover)}.list{display:grid;gap:4px}.row{position:relative;display:grid;grid-template-columns:32px minmax(0,1fr);align-items:center;gap:11px;min-height:80px;padding:10px 11px;border-radius:8px;color:inherit;transition:background-color 120ms ease}.row:hover{background:var(--surface-hover)}.icon{display:grid;width:30px;height:30px;place-items:center;border-radius:7px;background:var(--success-soft);color:var(--success)}.icon.blocked,.icon.closed{background:var(--danger-soft);color:var(--danger)}.icon.merged{background:#241d33;color:#a98ae8}.main{min-width:0}.main .title-link,.main>small{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.main .title-link{color:var(--text-strong);font-size:12px;font-weight:650;text-decoration:none}.main .title-link::after{position:absolute;z-index:0;inset:0;content:''}.main>small{margin-top:4px;color:var(--text-muted);font-size:10px}.main .author-link{position:relative;z-index:1;color:var(--text-strong);text-decoration:none}.main .author-link:hover{color:var(--brand)}.details{display:flex;min-width:0;align-items:center;gap:5px;margin-top:5px}.main code{display:flex;min-width:0;align-items:center;gap:3px;color:var(--text-faint);font-size:9px;white-space:nowrap}.label{padding:3px 6px;border-radius:999px;background:color-mix(in srgb,var(--label-color) 15%,transparent);color:var(--label-color);font-size:8px;font-weight:650}.more-labels{color:var(--text-faint);font-size:8px}.checks{display:inline-flex;align-items:center;gap:4px;color:var(--success);font-size:9px;font-weight:600;white-space:nowrap}.checks.failed{color:var(--danger)}.checks.running{color:var(--warning)}.checks.quiet{color:var(--text-faint)}.empty{padding:48px 20px;color:var(--text-faint);text-align:center}.empty strong{display:block;margin-top:10px;color:var(--text-strong);font-size:13px}.empty p{margin-top:5px}.page :global(.load-more.button){display:flex;margin:18px auto 0}@media(max-width:600px){.heading>a{display:none}.label,.more-labels{display:none}.row{padding-inline:5px}}
</style>
