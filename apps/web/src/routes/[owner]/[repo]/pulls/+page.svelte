<script lang="ts">
  import { page } from '$app/stores';
  import { onMount } from 'svelte';
  import type { PullRequestSummary } from '@sty/contracts';
  import CircleAlert from 'lucide-svelte/icons/circle-alert';
  import CircleCheck from 'lucide-svelte/icons/circle-check';
  import GitPullRequest from 'lucide-svelte/icons/git-pull-request';
  import FilterBar from '$lib/components/FilterBar.svelte';
  import { api } from '$lib/api';

  const owner = $derived($page.params.owner);
  const repo = $derived($page.params.repo);
  let items = $state<PullRequestSummary[]>([]);
  let liveError = $state(false);
  onMount(async () => { try { items = (await api<{pullRequests:PullRequestSummary[]}>(`/repositories/${owner}/${repo}/pulls`)).pullRequests; } catch { liveError = true; } });
</script>

<svelte:head><title>Pull requests · {$page.params.owner}/{$page.params.repo} · Sty</title></svelte:head>
<header class="heading"><div><h1>Pull requests</h1><p>Propose, review, and merge changes to this repository.</p></div><a href="/pulls/new?repository={owner}/{repo}">New pull request</a></header>
<FilterBar placeholder="Search this repository" tabs={['Open', 'Merged', 'Closed']} active="Open" />
{#if liveError}<p class="notice" role="alert">Pull requests could not be loaded. Refresh to try again.</p>{/if}
<section class="list">
  {#each items as pull}
    <a class="row" href="/{owner}/{repo}/pulls/{pull.number}">
      <span class:blocked={pull.state === 'blocked'} class="icon"><GitPullRequest size={17} /></span>
      <span class="main"><strong>{pull.title}</strong><small>#{pull.number} opened by {pull.author} · {pull.updatedAt}</small><code>{pull.sourceBranch} → {pull.targetBranch}</code></span>
      <span class:failed={pull.checkSummary.failed > 0} class="checks">{#if pull.checkSummary.failed}<CircleAlert size={14} />{pull.checkSummary.failed} failed{:else}<CircleCheck size={14} />{pull.checkSummary.passed} passed{/if}</span>
    </a>
  {:else}
    <div class="empty"><GitPullRequest size={23} /><strong>No open pull requests</strong><p>Changes proposed to this repository will appear here.</p></div>
  {/each}
</section>

<style>
  .heading { display: flex; align-items: flex-end; justify-content: space-between; gap: 20px; margin-bottom: 24px; } h1 { margin: 0; color: var(--text-strong); font-size: 22px; letter-spacing: -.025em; } p { margin: 6px 0 0; color: var(--text-muted); font-size: 12px; } .heading > a { display: inline-flex; height: 34px; align-items: center; padding: 0 12px; border-radius: 7px; background: var(--brand); color: white; font-size: 11px; font-weight: 640; text-decoration: none; }
  .list { border-top: 1px solid var(--border); } .row { display: grid; grid-template-columns: 32px minmax(0,1fr) auto; align-items: center; gap: 11px; min-height: 72px; padding: 10px 4px; border-bottom: 1px solid var(--border-subtle); color: inherit; text-decoration: none; } .row:hover { background: var(--surface-hover); }
  .icon { display: grid; width: 30px; height: 30px; place-items: center; border-radius: 7px; background: var(--success-soft); color: var(--success); } .icon.blocked { background: var(--danger-soft); color: var(--danger); } .main { min-width: 0; } .main strong, .main small, .main code { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } .main strong { color: var(--text-strong); font-size: 12px; } .main small { margin-top: 4px; color: var(--text-muted); font-size: 10px; } .main code { margin-top: 4px; color: var(--text-faint); font-size: 9px; }
  .checks { display: inline-flex; align-items: center; gap: 4px; color: var(--success); font-size: 10px; font-weight: 600; } .checks.failed { color: var(--danger); } .empty { padding: 48px 20px; color: var(--text-faint); text-align: center; } .empty strong { display: block; margin-top: 10px; color: var(--text-strong); font-size: 13px; } .empty p { margin-top: 5px; }
  .notice{color:var(--warning);font-size:10px}
  @media (max-width: 600px) { .heading > a, .checks { display: none; } .row { grid-template-columns: 32px minmax(0,1fr); } }
</style>
