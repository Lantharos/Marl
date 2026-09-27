<script lang="ts">
  import type { InboxItem, RepositorySummary, RunSummary } from '@marl/contracts';
  import ArrowUpRight from '@lucide/svelte/icons/arrow-up-right';
  import CirclePlay from '@lucide/svelte/icons/circle-play';
  import FolderGit2 from '@lucide/svelte/icons/folder-git-2';
  import Plus from '@lucide/svelte/icons/plus';
  import InboxList from '$lib/inbox/InboxList.svelte';
  import LinkButton from '$lib/components/controls/LinkButton.svelte';
  import EmptyState from '$lib/components/feedback/EmptyState.svelte';
  import Notice from '$lib/components/feedback/Notice.svelte';
  import RepositoryIcon from '$lib/components/identity/RepositoryIcon.svelte';
  import RunStateIcon from '$lib/runs/RunStateIcon.svelte';
  import { awaitingCheckApproval, runStateLabel } from '$lib/runs/run-state';

  type DashboardData = {
    inbox: { items: InboxItem[]; counts: { inbox: number; unread: number; done: number } };
    repositories: RepositorySummary[];
    runs: RunSummary[];
    user: { handle: string; displayName: string };
    unavailable: boolean;
  };

  let { data }: { data: DashboardData } = $props();
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

{#snippet sectionHeader(title: string, href: string, label: string)}
  <header class="mb-3 flex items-center justify-between gap-4">
    <h2 class="text-base font-semibold text-ink-strong">{title}</h2>
    <a class="inline-flex items-center gap-1 text-sm text-ink-muted transition-colors hover:text-brand" {href}
      >{label}<ArrowUpRight size={14} /></a
    >
  </header>
{/snippet}

<main class="mx-auto w-full max-w-290 px-4 pt-8 pb-20 sm:px-6 sm:pt-12">
  <header class="mb-8">
    <h1 class="text-3xl font-semibold tracking-tight text-ink-strong sm:text-4xl">Hey, {firstName}.</h1>
    {#if inbox.counts.unread > 0}<p class="mt-2 text-base text-ink-muted">
        {inbox.counts.unread} new {inbox.counts.unread === 1 ? 'update' : 'updates'} in your inbox.
      </p>{/if}
  </header>

  {#if data.unavailable}<Notice tone="warning" class="mb-6"
      >Some live data couldn’t be reached. What loaded is still shown below.</Notice
    >{/if}

  <div class="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-10">
    <div class="grid min-w-0 gap-9">
      <section>
        {@render sectionHeader('Inbox', '/inbox', 'View inbox')}
        <InboxList items={inbox.items} compact />
      </section>
      <section>
        {@render sectionHeader('Recent runs', '/runs', 'All runs')}
        <div class="surface p-1.5">
          {#each runs.slice(0, 5) as run (run.id)}
            <a
              href="/{run.repository.owner}/{run.repository.name}/runs/{run.number}"
              class="grid min-h-15 grid-cols-[20px_minmax(0,1fr)_auto] items-center gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-surface-hover"
            >
              <RunStateIcon
                state={run.state}
                awaitingApproval={awaitingCheckApproval(run)}
                label={runStateLabel(run)}
              />
              <span class="min-w-0">
                <strong class="block truncate text-sm font-semibold text-ink-strong">{run.name}</strong>
                <span class="mt-0.5 block truncate text-xs text-ink-muted"
                  >{run.repository.name} · {run.branch}{awaitingCheckApproval(run) ? ' · Awaiting approval' : ''}</span
                >
              </span>
              <code class="font-mono text-xs text-ink-faint">{run.commit.slice(0, 7)}</code>
            </a>
          {:else}
            <EmptyState
              compact
              icon={CirclePlay}
              title="No runs yet"
              description="Runs appear here once a repository with a workflow pushes to a self-hosted runner."
            />
          {/each}
        </div>
      </section>
    </div>

    <aside class="min-w-0">
      {@render sectionHeader('Repositories', '/repositories', 'All repositories')}
      <div class="surface p-1.5">
        {#each repositories.slice(0, 7) as repository (repository.id)}
          <a
            href="/{repository.owner}/{repository.name}"
            class="group grid grid-cols-[26px_minmax(0,1fr)_14px] items-center gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-surface-hover"
          >
            <RepositoryIcon name={repository.name} src={repository.iconUrl} size={26} />
            <span class="min-w-0">
              <strong class="block truncate text-sm font-semibold text-ink-strong">{repository.name}</strong>
              <span class="block truncate text-xs text-ink-muted">{repository.owner}</span>
            </span>
            <ArrowUpRight size={14} class="text-ink-faint group-hover:text-brand" />
          </a>
        {:else}
          <EmptyState
            compact
            icon={FolderGit2}
            title="No repositories yet"
            description="Create one, then push your code."
          >
            <LinkButton size="small" variant="primary" href="/repositories/new"
              ><Plus size={14} />New repository</LinkButton
            >
          </EmptyState>
        {/each}
      </div>
    </aside>
  </div>
</main>
