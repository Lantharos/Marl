<script lang="ts">
  import { onMount } from 'svelte';
  import type { PullRequestSummary } from '@sty/contracts';
  import CircleAlert from 'lucide-svelte/icons/circle-alert';
  import CircleCheck from 'lucide-svelte/icons/circle-check';
  import CircleDot from 'lucide-svelte/icons/circle-dot';
  import GitPullRequest from 'lucide-svelte/icons/git-pull-request';
  import FilterBar from '$lib/components/FilterBar.svelte';
  import PageHeader from '$lib/components/PageHeader.svelte';
  import { api } from '$lib/api';
  let items = $state<PullRequestSummary[]>([]);
  let liveError = $state(false);
  onMount(async () => { try { items = (await api<{pullRequests:PullRequestSummary[]}>('/pulls')).pullRequests; } catch { liveError = true; } });
</script>

<svelte:head><title>Pull requests · Sty</title></svelte:head>
<main class="page">
  <PageHeader title="Pull requests" description="Review, unblock, and ship changes from one queue." actionHref="/pulls/new" actionLabel="New pull request" />
  <FilterBar placeholder="Search pull requests" tabs={['Open']} active="Open" />
  {#if liveError}<p class="notice" role="alert">Pull requests could not be loaded. Refresh to try again.</p>{/if}
  <section class="list" aria-label="Pull requests">
    {#each items as pull}
      <a class="row" href="/{pull.repository.owner}/{pull.repository.name}/pulls/{pull.number}">
        <span class:blocked={pull.state === 'blocked'} class:ready={pull.state === 'mergeable'} class="state"><GitPullRequest size={17} /></span>
        <span class="main"><strong>{pull.title}</strong><small>{pull.repository.owner}/{pull.repository.name} #{pull.number} opened by {pull.author} · {pull.updatedAt}</small><code>{pull.sourceBranch} → {pull.targetBranch}</code></span>
        <span class="review">{#if pull.reviewStatus === 'approved'}<CircleCheck size={14} />Approved{:else if pull.reviewStatus === 'changes_requested'}<CircleAlert size={14} />Changes requested{:else}<CircleDot size={14} />Review requested{/if}</span>
        <span class="checks" class:failed={pull.checkSummary.failed > 0}><CircleCheck size={14} />{pull.checkSummary.passed}/{pull.checkSummary.total}</span>
      </a>
    {:else}<div class="empty"><GitPullRequest size={22} /><strong>No open pull requests</strong><p>Open one when a branch is ready for review.</p></div>{/each}
  </section>
</main>

<style>
  .page { width: min(1040px, calc(100% - 64px)); margin: 0 auto; padding: 44px 0 72px; }
  .list { border-top: 1px solid var(--border); }
  .notice{margin:0 0 10px;color:var(--warning);font-size:10px}.empty{padding:50px 20px;color:var(--text-faint);text-align:center}.empty strong{display:block;margin-top:8px;color:var(--text-strong);font-size:12px}.empty p{font-size:10px}
  .row { display: grid; grid-template-columns: 32px minmax(0,1fr) 132px 54px; align-items: center; gap: 11px; min-height: 76px; padding: 11px 4px; border-bottom: 1px solid var(--border-subtle); color: inherit; text-decoration: none; }
  .row:hover { background: var(--surface-hover); }
  .state { display: grid; width: 30px; height: 30px; place-items: center; border-radius: 8px; background: var(--brand-soft); color: var(--brand); }
  .state.blocked { background: var(--danger-soft); color: var(--danger); } .state.ready { background: var(--success-soft); color: var(--success); }
  .main { min-width: 0; } .main strong, .main small, .main code { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .main strong { color: var(--text-strong); font-size: 12px; font-weight: 640; } .main small { margin-top: 4px; color: var(--text-muted); font-size: 10px; }
  .main code { margin-top: 4px; color: var(--text-faint); font-size: 9px; }
  .review, .checks { display: inline-flex; align-items: center; gap: 4px; color: var(--text-muted); font-size: 10px; font-weight: 580; }
  .checks { color: var(--success); } .checks.failed { color: var(--danger); }
  @media (max-width: 760px) { .page { width: calc(100% - 28px); padding-top: 28px; } .row { grid-template-columns: 32px minmax(0,1fr) 40px; } .review { display: none; } }
</style>
