<script lang="ts">
  import { page } from '$app/stores';
  import type { PullRequestSummary } from '@marl/contracts';
  import CircleAlert from 'lucide-svelte/icons/circle-alert';
  import CircleCheck from 'lucide-svelte/icons/circle-check';
  import CircleDot from 'lucide-svelte/icons/circle-dot';
  import ArrowRight from 'lucide-svelte/icons/arrow-right';
  import GitMerge from 'lucide-svelte/icons/git-merge';
  import GitPullRequest from 'lucide-svelte/icons/git-pull-request';
  import GitPullRequestClosed from 'lucide-svelte/icons/git-pull-request-closed';
  import FilterBar from '$lib/components/FilterBar.svelte';
  import Time from '$lib/components/Time.svelte';
  import type { PageData } from './$types';

  let { data } = $props<{ data: PageData }>();
  const owner = $derived($page.params.owner);
  const repo = $derived($page.params.repo);
  const items = $derived(data.pullRequests as PullRequestSummary[]);
  let query = $state(''); let activeFilter = $state('Open');
  const filteredItems = $derived(items.filter((pull) => {
    const stateMatches = activeFilter === 'Open' ? !['merged', 'closed'].includes(pull.state) : pull.state === activeFilter.toLowerCase();
    return stateMatches && `${pull.title} ${pull.author} ${pull.sourceBranch} ${pull.targetBranch}`.toLowerCase().includes(query.trim().toLowerCase());
  }));
</script>

<svelte:head><title>Pull requests · {$page.params.owner}/{$page.params.repo} · Marl</title></svelte:head>
<header class="heading"><div><h1>Pull requests</h1><p>Propose, review, and merge changes to this repository.</p></div><a href={data.repository?.upstream ? `/pulls/new?repository=${data.repository.upstream.owner}/${data.repository.upstream.name}&sourceRepository=${owner}/${repo}` : `/pulls/new?repository=${owner}/${repo}`}>{data.repository?.upstream ? 'Contribute upstream' : 'New pull request'}</a></header>
<FilterBar placeholder="Search this repository" tabs={['Open', 'Merged', 'Closed']} bind:active={activeFilter} bind:query />
<section class="list">
  {#each filteredItems as pull}
    <article class="row">
      <span class:blocked={pull.state === 'blocked'} class:merged={pull.state === 'merged'} class:closed={pull.state === 'closed'} class="icon">{#if pull.state === 'merged'}<GitMerge size={17} />{:else if pull.state === 'closed'}<GitPullRequestClosed size={17} />{:else}<GitPullRequest size={17} />{/if}</span>
      <span class="main"><a class="title-link" href="/{owner}/{repo}/pulls/{pull.number}">{pull.title}</a><small>#{pull.number} opened by <a class="author-link" href="/{pull.author}">{pull.authorDisplayName}</a> · <Time value={pull.updatedAt} /></small><code>{pull.sourceRepository && `${pull.sourceRepository.owner}/${pull.sourceRepository.name}` !== `${owner}/${repo}` ? `${pull.sourceRepository.owner}:${pull.sourceBranch}` : pull.sourceBranch}<ArrowRight size={11} />{pull.targetBranch}</code></span>
      <span class:failed={pull.checkSummary.failed > 0} class:quiet={pull.checkSummary.total === 0} class="checks">{#if pull.checkSummary.failed}<CircleAlert size={14} />{pull.checkSummary.failed} failed{:else if pull.checkSummary.total === 0}<CircleDot size={14} />No checks{:else}<CircleCheck size={14} />{pull.checkSummary.passed} passed{/if}</span>
    </article>
  {:else}
    <div class="empty"><GitPullRequest size={23} /><strong>No open pull requests</strong><p>Changes proposed to this repository will appear here.</p></div>
  {/each}
</section>

<style>
  .heading { display: flex; align-items: flex-end; justify-content: space-between; gap: 20px; margin-bottom: 24px; } h1 { margin: 0; color: var(--text-strong); font-size: 22px; letter-spacing: -.025em; } p { margin: 6px 0 0; color: var(--text-muted); font-size: 12px; } .heading > a { display: inline-flex; height: 34px; align-items: center; padding: 0 12px; border-radius: 7px; background: var(--brand); color: white; font-size: 11px; font-weight: 640; text-decoration: none; }
  .row { position:relative;display: grid; grid-template-columns: 32px minmax(0,1fr) auto; align-items: center; gap: 11px; min-height: 72px; padding: 10px 4px; border-bottom: 1px solid var(--border-subtle); color: inherit; } .row:hover { background: var(--surface-hover); }
  .icon { display: grid; width: 30px; height: 30px; place-items: center; border-radius: 7px; background: var(--success-soft); color: var(--success); } .icon.blocked,.icon.closed { background: var(--danger-soft); color: var(--danger); }.icon.merged{background:#241d33;color:#a98ae8}.main { min-width: 0; } .main .title-link, .main small { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } .main .title-link { color: var(--text-strong); font-size: 12px;font-weight:650;text-decoration:none; }.main .title-link::after{position:absolute;z-index:0;inset:0;content:''}.main small { margin-top: 4px; color: var(--text-muted); font-size: 10px; }.main .author-link{position:relative;z-index:1;color:var(--text-strong);text-decoration:none}.main .author-link:hover{color:var(--brand)} .main code { display:flex;align-items:center;gap:3px;margin-top:4px;color:var(--text-faint);font-size:9px; }
  .checks { display: inline-flex; align-items: center; gap: 4px; color: var(--success); font-size: 10px; font-weight: 600; } .checks.failed { color: var(--danger); }.checks.quiet{color:var(--text-faint)}.empty { padding: 48px 20px; color: var(--text-faint); text-align: center; } .empty strong { display: block; margin-top: 10px; color: var(--text-strong); font-size: 13px; } .empty p { margin-top: 5px; }
  @media (max-width: 600px) { .heading > a, .checks { display: none; } .row { grid-template-columns: 32px minmax(0,1fr); } }
</style>
