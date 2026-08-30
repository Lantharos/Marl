<script lang="ts">
  import type { PullRequestSummary, RepositorySummary, RunnerSummary, RunSummary } from '@marl/contracts';
  import ArrowUpRight from 'lucide-svelte/icons/arrow-up-right';
  import CircleAlert from 'lucide-svelte/icons/circle-alert';
  import CircleCheck from 'lucide-svelte/icons/circle-check';
  import CircleDot from 'lucide-svelte/icons/circle-dot';
  import GitPullRequest from 'lucide-svelte/icons/git-pull-request';
  import ServerOff from 'lucide-svelte/icons/server-off';
  import Time from '$lib/components/Time.svelte';
  import RepositoryIcon from '$lib/components/RepositoryIcon.svelte';
  import type { PageData } from './$types';
  let { data } = $props<{ data: PageData }>();
  const pulls = $derived(data.pulls as PullRequestSummary[]);
  const repositories = $derived(data.repositories as RepositorySummary[]);
  const runs = $derived(data.runs as RunSummary[]);
  const runners = $derived(data.runners as RunnerSummary[]);
  const unavailable = $derived(data.unavailable);
  const blockedPulls = $derived(pulls.filter((pull) => pull.state === 'blocked' || pull.reviewStatus === 'changes_requested'));
  const failedRuns = $derived(runs.filter((run) => run.state === 'failure'));
  const offlineRunners = $derived(runners.filter((runner) => runner.state === 'offline'));
  const attentionCount = $derived(blockedPulls.length + failedRuns.length + offlineRunners.length);
  const firstName = $derived((data.user?.displayName || data.user?.handle || 'there').trim().split(/\s+/)[0]);

</script>

<svelte:head><title>Home · Marl</title><meta name="description" content="Your work in Marl." /></svelte:head>

<main class="page">
  <header class="hello"><div><h1>Hey, {firstName}.</h1><p>{#if attentionCount > 0}{attentionCount} {attentionCount === 1 ? 'thing needs' : 'things need'} you.{:else}You’re clear for now.{/if}</p></div></header>
  {#if unavailable}<p class="unavailable">Some live data couldn’t be reached. What loaded is still shown below.</p>{/if}

  <div class="workspace">
    <section class="attention">
      <header><h2>Needs you</h2><a href="/pulls">Open review queue <ArrowUpRight size={13} /></a></header>
      <div class="feed">
        {#each blockedPulls as pull (pull.id)}
          <a href="/{pull.repository.owner}/{pull.repository.name}/pulls/{pull.number}"><span class="signal danger"><GitPullRequest size={16} /></span><span><strong>{pull.title}</strong><small>{pull.repository.owner}/{pull.repository.name} · !{pull.number} · changes requested</small></span><ArrowUpRight size={14} /></a>
        {/each}
        {#each failedRuns as run (run.id)}
          <a href="/{run.repository.owner}/{run.repository.name}/runs/{run.number}"><span class="signal danger"><CircleAlert size={16} /></span><span><strong>{run.name} failed</strong><small>{run.repository.owner}/{run.repository.name} · {run.branch} · {run.commit.slice(0,7)}</small></span><ArrowUpRight size={14} /></a>
        {/each}
        {#each offlineRunners as runner (runner.id)}
          <a href="/runners"><span class="signal warning"><ServerOff size={16} /></span><span><strong>{runner.name} is offline</strong><small>Last seen <Time value={runner.lastSeenAt} /> · {runner.labels.join(', ')}</small></span><ArrowUpRight size={14} /></a>
        {/each}
        {#if attentionCount === 0}<div class="clear"><span><CircleCheck size={18} /></span><div><strong>Nothing is blocked.</strong><p>Failed runs, requested changes, and unhealthy runners will land here.</p></div></div>{/if}
      </div>

      <header class="recent-title"><h2>Recent runs</h2><a href="/runs">See every run <ArrowUpRight size={13} /></a></header>
      <div class="runs">
        {#each runs.slice(0,5) as run (run.id)}<a href="/{run.repository.owner}/{run.repository.name}/runs/{run.number}"><span class="run-state {run.state}">{#if run.state === 'success'}<CircleCheck size={15} />{:else if run.state === 'failure'}<CircleAlert size={15} />{:else}<CircleDot size={15} />{/if}</span><span><strong>{run.name}</strong><small>{run.repository.name} · {run.branch}</small></span><code>{run.commit.slice(0,7)}</code></a>{:else}<p class="quiet">No runs yet. Your first self-hosted workflow will show up here.</p>{/each}
      </div>
    </section>

    <aside>
      <header><h2>Your places</h2><a href="/repositories">All repositories</a></header>
      <div class="repo-list">{#each repositories.slice(0,7) as repository (repository.id)}<a href="/{repository.owner}/{repository.name}"><RepositoryIcon name={repository.name} src={repository.iconUrl} size={25} /><span><strong>{repository.name}</strong><small>{repository.owner}</small></span><ArrowUpRight size={13} /></a>{:else}<div class="no-repos"><p>No repositories yet.</p><a href="/repositories/new">Create the first one</a></div>{/each}</div>
    </aside>
  </div>
</main>

<style>
  .page{width:min(1040px,calc(100% - 56px));margin:0 auto;padding:50px 0 80px}.hello{display:flex;align-items:flex-end;justify-content:space-between}.hello h1{margin:0;color:var(--text-strong);font-size:32px;font-weight:640;letter-spacing:-.045em}.hello p{margin:7px 0 0;color:var(--text-muted);font-size:12px}.unavailable{margin:12px 0 -5px;color:var(--warning);font-size:10px}.workspace{display:grid;grid-template-columns:minmax(0,1fr) 270px;gap:42px;padding-top:32px}.attention>header,aside>header{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px}.attention h2,aside h2{margin:0;color:var(--text-strong);font-size:12px;font-weight:650}.attention header>a,aside header>a{display:inline-flex;align-items:center;gap:4px;color:var(--text-faint);font-size:9px;text-decoration:none}.attention header>a:hover,aside header>a:hover{color:var(--brand)}.feed,.runs,.repo-list{display:grid;gap:3px}.feed>a{display:grid;grid-template-columns:32px minmax(0,1fr) 15px;align-items:center;gap:10px;min-height:62px;padding:8px 10px;border-radius:8px;color:inherit;text-decoration:none}.feed>a:hover,.runs>a:hover,.repo-list>a:hover{background:var(--surface-hover)}.signal{display:grid;width:29px;height:29px;place-items:center;border-radius:7px}.signal.danger{background:var(--danger-soft);color:var(--danger)}.signal.warning{background:var(--warning-soft);color:var(--warning)}.feed strong,.feed small,.runs strong,.runs small,.repo-list strong,.repo-list small{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.feed strong{color:var(--text-strong);font-size:11px}.feed small{margin-top:4px;color:var(--text-faint);font-size:9px}.feed>a>:global(svg:last-child),.repo-list>a>:global(svg:last-child){color:var(--text-faint)}.clear{display:flex;align-items:center;gap:12px;min-height:78px;padding:12px 0}.clear>span{display:grid;width:32px;height:32px;place-items:center;border-radius:50%;background:var(--success-soft);color:var(--success)}.clear strong{color:var(--text-strong);font-size:11px}.clear p,.quiet{margin:4px 0 0;color:var(--text-faint);font-size:9px}.recent-title{margin-top:30px!important}.runs>a{display:grid;grid-template-columns:24px minmax(0,1fr) auto;align-items:center;gap:8px;min-height:48px;padding:6px 10px;border-radius:7px;color:inherit;text-decoration:none}.run-state{display:grid;place-items:center;color:var(--text-faint)}.run-state.success{color:var(--success)}.run-state.failure{color:var(--danger)}.run-state.running,.run-state.queued{color:var(--brand)}.runs strong{color:var(--text-strong);font-size:10px}.runs small{margin-top:3px;color:var(--text-faint);font-size:9px}.runs code{color:var(--text-faint);font-size:9px}.quiet{padding:16px 0}.repo-list>a{display:grid;grid-template-columns:27px minmax(0,1fr) 14px;align-items:center;gap:9px;min-height:48px;padding:5px 8px;border-radius:7px;color:inherit;text-decoration:none}.repo-list strong{color:var(--text-strong);font-size:10px}.repo-list small{margin-top:2px;color:var(--text-faint);font-size:9px}.no-repos{padding:14px 0}.no-repos p{margin:0 0 5px;color:var(--text-faint);font-size:9px}.no-repos a{color:var(--brand);font-size:9px}
  @media(max-width:850px){.workspace{grid-template-columns:1fr;gap:40px}.page{width:calc(100% - 36px);padding-top:38px}.hello h1{font-size:29px}}@media(max-width:560px){.hello{align-items:flex-start}.workspace{padding-top:28px}.page{width:calc(100% - 28px)}.feed>a{grid-template-columns:31px minmax(0,1fr)}.feed>a>:global(svg:last-child){display:none}}
</style>
