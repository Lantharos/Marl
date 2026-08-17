<script lang="ts">
  import type { PullRequestSummary } from '@sty/contracts';
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

  let { data } = $props<{ data: PageData }>();
  const items = $derived(data.pullRequests as PullRequestSummary[]);
  let query = $state('');
  let activeFilter = $state('Open');
  const filteredItems = $derived(items.filter((pull) => {
    const stateMatches = activeFilter === 'Open' ? !['merged', 'closed'].includes(pull.state) : pull.state === activeFilter.toLowerCase();
    const haystack = `${pull.title} ${pull.author} ${pull.repository.owner}/${pull.repository.name} ${pull.sourceBranch} ${pull.targetBranch}`.toLowerCase();
    return stateMatches && haystack.includes(query.trim().toLowerCase());
  }));
</script>

<svelte:head><title>Pull requests · Sty</title></svelte:head>
<main class="page">
  <PageHeader title="Pull requests" description="Review, unblock, and ship changes from one queue." actionHref="/pulls/new" actionLabel="New pull request" />
  <FilterBar placeholder="Search pull requests" tabs={['Open', 'Merged', 'Closed']} bind:active={activeFilter} bind:query />
  <section class="list" aria-label="Pull requests">
    {#each filteredItems as pull}
      <a class="row" href="/{pull.repository.owner}/{pull.repository.name}/pulls/{pull.number}">
        <span class:blocked={pull.state === 'blocked'} class:ready={pull.state === 'mergeable'} class:merged={pull.state === 'merged'} class:closed={pull.state === 'closed'} class="state">{#if pull.state === 'merged'}<GitMerge size={17} />{:else if pull.state === 'closed'}<GitPullRequestClosed size={17} />{:else}<GitPullRequest size={17} />{/if}</span>
        <span class="main"><strong>{pull.title}</strong><small>{pull.repository.owner}/{pull.repository.name} #{pull.number} opened by {pull.author} · <Time value={pull.updatedAt} /></small><code>{pull.sourceBranch}<ArrowRight size={11} />{pull.targetBranch}</code></span>
        <span class="review">{#if pull.reviewStatus === 'approved'}<CircleCheck size={14} />Approved{:else if pull.reviewStatus === 'changes_requested'}<CircleAlert size={14} />Changes requested{:else}<CircleDot size={14} />Review requested{/if}</span>
        <span class="checks" class:failed={pull.checkSummary.failed > 0} class:empty-checks={pull.checkSummary.total === 0}>{#if pull.checkSummary.total === 0}<CircleDot size={14} />No checks{:else}<CircleCheck size={14} />{pull.checkSummary.passed}/{pull.checkSummary.total}{/if}</span>
      </a>
    {:else}<div class="empty"><GitPullRequest size={22} /><strong>No pull requests</strong><p>No pull requests match this view.</p></div>{/each}
  </section>
</main>

<style>
  .page{width:min(1040px,calc(100% - 64px));margin:0 auto;padding:44px 0 72px}.empty{padding:50px 20px;color:var(--text-faint);text-align:center}.empty strong{display:block;margin-top:8px;color:var(--text-strong);font-size:12px}.empty p{font-size:10px}.row{display:grid;grid-template-columns:32px minmax(0,1fr) 132px 64px;align-items:center;gap:11px;min-height:76px;padding:11px 4px;border-bottom:1px solid var(--border-subtle);color:inherit;text-decoration:none}.row:hover{background:var(--surface-hover)}.state{display:grid;width:30px;height:30px;place-items:center;border-radius:8px;background:var(--brand-soft);color:var(--brand)}.state.blocked{background:var(--danger-soft);color:var(--danger)}.state.ready{background:var(--success-soft);color:var(--success)}.state.merged{background:color-mix(in srgb,#8b5cf6 18%,transparent);color:#a78bfa}.main{min-width:0}.main strong,.main small{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.main strong{color:var(--text-strong);font-size:12px;font-weight:640}.main small{margin-top:4px;color:var(--text-muted);font-size:10px}.main code{display:flex;align-items:center;gap:5px;margin-top:4px;color:var(--text-faint);font-size:9px}.review,.checks{display:inline-flex;align-items:center;gap:4px;color:var(--text-muted);font-size:10px;font-weight:580}.checks{color:var(--success)}.checks.failed{color:var(--danger)}.checks.empty-checks{color:var(--text-faint)}@media(max-width:760px){.page{width:calc(100% - 28px);padding-top:28px}.row{grid-template-columns:32px minmax(0,1fr) 40px}.review{display:none}}
  .state.closed{background:var(--danger-soft);color:var(--danger)}
</style>
