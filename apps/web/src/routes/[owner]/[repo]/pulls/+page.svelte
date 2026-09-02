<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { onDestroy, untrack } from 'svelte';
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
  import PageHeader from '$lib/components/PageHeader.svelte';
  import Seo from '$lib/components/Seo.svelte';
  import Time from '$lib/components/Time.svelte';
  import { api, MarlApiError } from '$lib/api';
  import type { PageData } from './$types';

  let { data } = $props<{ data: PageData }>();
  const owner = $derived($page.params.owner);
  const repo = $derived($page.params.repo);
  let items = $state.raw<PullRequestSummary[]>(untrack(() => data.pullRequests));
  let nextCursor = $state<string | null>(untrack(() => data.nextCursor));
  let query = $state(untrack(() => data.query));
  let activeFilter = $state(untrack(() => data.state[0].toUpperCase() + data.state.slice(1)));
  let selectedLabels = $state<string[]>(untrack(() => data.labels));
  let loadingMore = $state(false);
  let loadError = $state('');
  let queryTimer: ReturnType<typeof setTimeout> | undefined;
  let listGeneration = 0;

  $effect(() => {
    items = [...data.pullRequests];
    nextCursor = data.nextCursor;
    query = data.query;
    activeFilter = data.state[0].toUpperCase() + data.state.slice(1);
    selectedLabels = [...data.labels];
    loadingMore = false;
    loadError = '';
    listGeneration += 1;
    clearTimeout(queryTimer);
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
    const generation = listGeneration;
    const cursor = nextCursor;
    const route = { owner, repo };
    loadingMore = true;
    loadError = '';
    try {
      const params = new URLSearchParams({ limit: '30', state: activeFilter.toLowerCase(), cursor });
      if (query.trim()) params.set('q', query.trim());
      for (const label of selectedLabels) params.append('label', label);
      const result = await api<{ pullRequests: PullRequestSummary[]; nextCursor: string | null }>(`/repositories/${route.owner}/${route.repo}/pulls?${params}`);
      if (generation !== listGeneration || owner !== route.owner || repo !== route.repo) return;
      const ids = new Set(items.map((pull) => pull.id));
      items = [...items, ...result.pullRequests.filter((pull) => !ids.has(pull.id))];
      nextCursor = result.nextCursor;
    } catch (cause) {
      if (generation === listGeneration) loadError = cause instanceof MarlApiError ? cause.message : 'More pull requests could not be loaded.';
    } finally {
      if (generation === listGeneration) loadingMore = false;
    }
  }
  onDestroy(() => clearTimeout(queryTimer));
</script>

<Seo title={`Pull requests · ${owner}/${repo} · Marl`} description={`Review proposed changes, discussion, and merge state for ${owner}/${repo} on Marl.`} path={$page.url.pathname} robots={data.repository.visibility === 'public' ? 'index, follow' : 'noindex, nofollow'} />
<div class="page">
<PageHeader title="Pull requests" description="Propose, review, and merge changes to this repository." actionHref={data.shellUser ? data.repository?.upstream ? `/pulls/new?repository=${data.repository.upstream.owner}/${data.repository.upstream.name}&sourceRepository=${owner}/${repo}` : `/pulls/new?repository=${owner}/${repo}` : undefined} actionLabel={data.shellUser ? data.repository?.upstream ? 'Contribute upstream' : 'New pull request' : undefined} />
<FilterBar placeholder="Search this repository" tabs={['Open', 'Merged', 'Closed']} labelOptions={data.availableLabels} bind:active={activeFilter} bind:query bind:selectedLabels onActiveChange={() => navigate()} onQueryChange={changeQuery} onLabelsChange={(labels) => navigate(activeFilter, query, labels)} />
<section class="list">
  {#each items as pull (pull.id)}
    <article class="row">
      <span class:blocked={pull.state === 'blocked'} class:merged={pull.state === 'merged'} class:closed={pull.state === 'closed'} class="icon">{#if pull.state === 'merged'}<GitMerge size={17} />{:else if pull.state === 'closed'}<GitPullRequestClosed size={17} />{:else}<GitPullRequest size={17} />{/if}</span>
      <span class="main"><span class="title-line"><a class="title-link" href="/{owner}/{repo}/pulls/{pull.number}">{pull.title}</a>{#if pull.labels.length}<span class="labels">{#each pull.labels.slice(0, 3) as label (label.id)}<span class="label" style:--label-color={label.color}>{label.name}</span>{/each}{#if pull.labels.length > 3}<span class="more-labels">+{pull.labels.length - 3}</span>{/if}</span>{/if}</span><small>!{pull.number} opened by <a class="author-link" href="/{pull.author}">{pull.authorDisplayName}</a> · <Time value={pull.updatedAt} /></small><span class="details"><code>{pull.sourceRepository && `${pull.sourceRepository.owner}/${pull.sourceRepository.name}` !== `${owner}/${repo}` ? `${pull.sourceRepository.owner}:${pull.sourceBranch}` : pull.sourceBranch}<ArrowRight size={11} />{pull.targetBranch}</code><span class:failed={pull.checkSummary.failed > 0} class:quiet={pull.checkSummary.total === 0} class:running={pull.checkSummary.running > 0} class="checks">{#if pull.checkSummary.failed}<CircleAlert size={12} />{pull.checkSummary.failed} failed{:else if pull.checkSummary.running}<CircleDot size={12} />{pull.checkSummary.running} running{:else if pull.checkSummary.total === 0}<CircleDot size={12} />No checks{:else}<CircleCheck size={12} />{pull.checkSummary.passed}/{pull.checkSummary.total} passed{/if}</span></span></span>
    </article>
  {:else}
    <div class="empty"><GitPullRequest size={23} /><strong>{query || selectedLabels.length ? 'No matching pull requests' : `No ${activeFilter.toLowerCase()} pull requests`}</strong><p>{query || selectedLabels.length ? 'Try another search or remove a label filter.' : 'Changes proposed to this repository will appear here.'}</p></div>
  {/each}
</section>
{#if loadError}<p class="load-error" role="alert">{loadError}</p>{/if}
{#if nextCursor}<Button class="load-more" loading={loadingMore} onclick={loadMore}>Load more</Button>{/if}
</div>

<style>
  .page{width:min(920px,100%);margin:0 auto}.list{display:grid;gap:4px}.row{position:relative;display:grid;grid-template-columns:32px minmax(0,1fr);align-items:center;gap:11px;min-height:80px;padding:10px 11px;border-radius:8px;color:inherit;transition:background-color 120ms ease}.row:hover{background:var(--surface-hover)}.icon{display:grid;width:30px;height:30px;place-items:center;border-radius:7px;background:var(--success-soft);color:var(--success)}.icon.blocked,.icon.closed{background:var(--danger-soft);color:var(--danger)}.icon.merged{background:#241d33;color:#a98ae8}.main{min-width:0}.title-line{display:flex;min-width:0;align-items:center;gap:6px}.main .title-link,.main>small{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.main .title-link{min-width:0;color:var(--text-strong);font-size:12px;font-weight:650;text-decoration:none}.main .title-link::after{position:absolute;z-index:0;inset:0;content:''}.main>small{margin-top:4px;color:var(--text-muted);font-size:10px}.main .author-link{position:relative;z-index:1;color:var(--text-strong);text-decoration:none}.main .author-link:hover{color:var(--brand)}.labels{position:relative;z-index:1;display:flex;min-width:0;align-items:center;gap:5px;overflow:hidden}.details{display:flex;min-width:0;align-items:center;gap:5px;margin-top:5px}.main code{display:flex;min-width:0;align-items:center;gap:3px;color:var(--text-faint);font-size:9px;white-space:nowrap}.label{flex:none;padding:3px 6px;border-radius:999px;background:color-mix(in srgb,var(--label-color) 15%,transparent);color:var(--label-color);font-size:8px;font-weight:650}.more-labels{flex:none;color:var(--text-faint);font-size:8px}.checks{display:inline-flex;align-items:center;gap:4px;color:var(--success);font-size:9px;font-weight:600;white-space:nowrap}.checks.failed{color:var(--danger)}.checks.running{color:var(--warning)}.checks.quiet{color:var(--text-faint)}.empty{padding:48px 20px;color:var(--text-faint);text-align:center}.empty strong{display:block;margin-top:10px;color:var(--text-strong);font-size:13px}.empty p{margin-top:5px}.load-error{margin:16px 0 0;color:var(--danger);font-size:10px;text-align:center}.page :global(.load-more.button){display:flex;margin:18px auto 0}@media(max-width:600px){.labels{display:none}.row{padding-inline:5px}}
</style>
