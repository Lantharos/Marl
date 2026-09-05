<script lang="ts">
  import type { InboxItem, RepositorySummary, RunSummary } from '@marl/contracts';
  import ArrowUpRight from 'lucide-svelte/icons/arrow-up-right';
  import CircleAlert from 'lucide-svelte/icons/circle-alert';
  import CircleCheck from 'lucide-svelte/icons/circle-check';
  import CircleDot from 'lucide-svelte/icons/circle-dot';
  import LinkButton from '$lib/components/LinkButton.svelte';
  import InboxList from '$lib/inbox/InboxList.svelte';
  import RepositoryIcon from '$lib/components/RepositoryIcon.svelte';

  type DashboardData = {
    inbox: { items: InboxItem[]; counts: { inbox: number; unread: number; done: number } };
    repositories: RepositorySummary[];
    runs: RunSummary[];
    user: { handle: string; displayName: string };
    unavailable: boolean;
  };

  let { data } = $props<{ data: DashboardData }>();
  const inbox = $derived(data.inbox);
  const repositories = $derived(data.repositories);
  const runs = $derived(data.runs);
  const firstName = $derived((data.user.displayName || data.user.handle).trim().split(/\s+/)[0]);
</script>

<svelte:head>
  <title>Home · Marl</title>
  <meta name="description" content="Your work in Marl." />
  <meta name="robots" content="noindex, noarchive" />
</svelte:head>

<main class="page">
  <header class="hello">
    <div>
      <h1>Hey, {firstName}.</h1>
      {#if inbox.counts.unread > 0}<p>{inbox.counts.unread} new {inbox.counts.unread === 1 ? 'update' : 'updates'} in your inbox.</p>{/if}
    </div>
    <LinkButton href="/repositories/new">New repository</LinkButton>
  </header>

  {#if data.unavailable}
    <p class="unavailable">Some live data couldn’t be reached. What loaded is still shown below.</p>
  {/if}

  <div class="workspace">
    <section class="primary">
      <header>
        <h2>Inbox</h2>
        <a href="/inbox">View inbox <ArrowUpRight size={13} /></a>
      </header>
      <InboxList items={inbox.items} compact />

      <header class="recent-title">
        <h2>Recent runs</h2>
        <a href="/runs">All runs <ArrowUpRight size={13} /></a>
      </header>
      <div class="runs">
        {#each runs.slice(0, 5) as run (run.id)}
          <a href="/{run.repository.owner}/{run.repository.name}/runs/{run.number}">
            <span class="run-state {run.state}">
              {#if run.state === 'success'}
                <CircleCheck size={15} />
              {:else if run.state === 'failure'}
                <CircleAlert size={15} />
              {:else}
                <CircleDot size={15} />
              {/if}
            </span>
            <span>
              <strong>{run.name}</strong>
              <small>{run.repository.name} · {run.branch}</small>
            </span>
            <code>{run.commit.slice(0, 7)}</code>
          </a>
        {:else}
          <p class="quiet">No runs yet. Your first self-hosted workflow will show up here.</p>
        {/each}
      </div>
    </section>

    <aside>
      <header>
        <h2>Repositories</h2>
        <a href="/repositories">All repositories</a>
      </header>
      <div class="repo-list">
        {#each repositories.slice(0, 7) as repository (repository.id)}
          <a href="/{repository.owner}/{repository.name}">
            <RepositoryIcon name={repository.name} src={repository.iconUrl} size={25} />
            <span>
              <strong>{repository.name}</strong>
              <small>{repository.owner}</small>
            </span>
            <ArrowUpRight size={13} />
          </a>
        {:else}
          <div class="no-repos">
            <p>No repositories yet.</p>
            <a href="/repositories/new">Create the first one</a>
          </div>
        {/each}
      </div>
    </aside>
  </div>
</main>

<style>
  .page{width:min(1040px,calc(100% - 56px));margin:0 auto;padding:50px 0 80px}.hello{display:flex;align-items:flex-end;justify-content:space-between}.hello h1{margin:0;color:var(--text-strong);font-size:30px;font-weight:640;letter-spacing:-.045em}.hello p{margin:7px 0 0;color:var(--text-muted);font-size:12px}.unavailable{margin:12px 0 -5px;color:var(--warning);font-size:11px}.workspace{display:grid;grid-template-columns:minmax(0,1fr) 270px;gap:32px;padding-top:32px}.primary>header,aside>header{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px}.primary h2,aside h2{margin:0;color:var(--text-strong);font-size:14px;font-weight:650}.primary header>a,aside header>a{display:inline-flex;align-items:center;gap:4px;color:var(--text-faint);font-size:11px;text-decoration:none}.primary header>a:hover,aside header>a:hover{color:var(--brand)}.runs,.repo-list{display:grid;gap:4px;padding:6px;border-radius:12px;background:var(--surface)}.runs>a:hover,.repo-list>a:hover{background:var(--surface-hover)}.runs strong,.runs small,.repo-list strong,.repo-list small{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.repo-list>a>:global(svg:last-child){color:var(--text-faint)}.quiet{margin:4px 0 0;color:var(--text-faint);font-size:11px}.recent-title{margin-top:30px!important}.runs>a{display:grid;grid-template-columns:24px minmax(0,1fr) auto;align-items:center;gap:8px;min-height:60px;padding:10px 12px;border-radius:7px;color:inherit;text-decoration:none}.run-state{display:grid;place-items:center;color:var(--text-faint)}.run-state.success{color:var(--success)}.run-state.failure{color:var(--danger)}.run-state.running,.run-state.queued{color:var(--brand)}.runs strong{color:var(--text-strong);font-size:13px}.runs small{margin-top:3px;color:var(--text-faint);font-size:11px}.runs code{color:var(--text-faint);font-size:11px}.quiet{padding:20px 14px}.repo-list>a{display:grid;grid-template-columns:27px minmax(0,1fr) 14px;align-items:center;gap:9px;min-height:48px;padding:10px 12px;border-radius:7px;color:inherit;text-decoration:none}.repo-list strong{color:var(--text-strong);font-size:13px}.repo-list small{margin-top:2px;color:var(--text-faint);font-size:11px}.no-repos{padding:20px 14px}.no-repos p{margin:0 0 5px;color:var(--text-faint);font-size:11px}.no-repos a{color:var(--brand);font-size:11px}
  @media(max-width:850px){.workspace{grid-template-columns:1fr;gap:40px}.page{width:calc(100% - 36px);padding-top:38px}.hello h1{font-size:29px}}@media(max-width:560px){.hello{align-items:flex-start;gap:16px;flex-wrap:wrap}.workspace{padding-top:28px}.page{width:calc(100% - 28px)}}
</style>
