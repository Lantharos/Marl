<script lang="ts">
  import type { RunnerSummary } from '@marl/contracts';
  import CircleAlert from '@lucide/svelte/icons/circle-alert';
  import Cpu from '@lucide/svelte/icons/cpu';
  import FilterBar from '$lib/components/page/FilterBar.svelte';
  import LinkButton from '$lib/components/controls/LinkButton.svelte';
  import EmptyState from '$lib/components/feedback/EmptyState.svelte';
  import Page from '$lib/components/page/Page.svelte';
  import PageHeader from '$lib/components/page/PageHeader.svelte';
  import RunnerStatus from '$lib/runs/RunnerStatus.svelte';
  import type { PageData } from './$types';
  let { data }: { data: PageData } = $props();
  const runners = $derived<RunnerSummary[]>(data.runners);
  let query = $state('');
  let activeFilter = $state('All');
  const active = $derived(runners.reduce((sum, runner) => sum + runner.activeJobs, 0));
  const offline = $derived(runners.filter((runner) => runner.state === 'offline').length);
  const filteredRunners = $derived(
    runners.filter(
      (runner) =>
        (activeFilter === 'All' || runner.state === activeFilter.toLowerCase()) &&
        `${runner.name} ${runner.platform} ${runner.architecture} ${runner.labels.join(' ')}`
          .toLowerCase()
          .includes(query.trim().toLowerCase())
    )
  );
</script>

<svelte:head><title>Runners · Marl</title></svelte:head>
<Page>
  <PageHeader title="Runners" actionHref="/runners/new" actionLabel="Connect runner" />
  <div class="-mt-3 mb-5 flex flex-wrap gap-x-5 gap-y-1 text-sm text-ink-muted">
    <span><strong class="font-semibold text-ink-strong tabular-nums">{runners.length}</strong> connected</span>
    <span
      ><strong class="font-semibold text-ink-strong tabular-nums">{active}</strong> active {active === 1
        ? 'job'
        : 'jobs'}</span
    >
    {#if offline}<span class="inline-flex items-center gap-1 text-warning"
        ><CircleAlert size={14} /><strong class="font-semibold tabular-nums">{offline}</strong> offline</span
      >{/if}
  </div>
  <FilterBar
    placeholder="Find a runner"
    tabs={['All', 'Idle', 'Busy', 'Offline']}
    bind:active={activeFilter}
    bind:query
  />
  <section class="surface p-1.5">
    {#each filteredRunners as runner (runner.id)}
      <a
        class="group grid grid-cols-[32px_minmax(0,1fr)_auto] items-center gap-3 rounded-lg px-3 py-3 transition-colors hover:bg-surface-hover sm:grid-cols-[32px_minmax(0,1fr)_minmax(0,1fr)_96px_80px]"
        href="/runners/{runner.id}"
      >
        <span class="grid size-8 place-items-center rounded-lg bg-surface-muted text-ink-muted"><Cpu size={17} /></span>
        <span class="min-w-0">
          <strong class="block truncate text-base font-semibold text-ink-strong group-hover:text-brand"
            >{runner.name}</strong
          >
          <span class="block truncate text-xs text-ink-muted"
            >{runner.platform} {runner.architecture} · v{runner.version}</span
          >
        </span>
        <span class="hidden min-w-0 flex-wrap gap-1 sm:flex">
          {#each runner.labels as label (label)}<code
              class="rounded bg-surface-muted px-1.5 py-0.5 font-mono text-2xs text-ink-muted">{label}</code
            >{/each}
        </span>
        <span class="hidden gap-1 sm:grid">
          <span class="text-xs text-ink tabular-nums">{runner.activeJobs}/{runner.concurrency} jobs</span>
          <span class="block h-1 overflow-hidden rounded-full bg-surface-muted"
            ><span
              class="block h-full rounded-full bg-brand"
              style:width={`${(runner.activeJobs / runner.concurrency) * 100}%`}
            ></span></span
          >
        </span>
        <span class="justify-self-end"><RunnerStatus state={runner.state} /></span>
      </a>
    {:else}
      <EmptyState
        icon={Cpu}
        title={runners.length ? 'No matching runners' : 'Connect your first runner'}
        description={runners.length
          ? 'Try another status, name, or label.'
          : 'Install Marl Runner on a machine with Git and Docker, then enroll it here.'}
      >
        {#if !runners.length}<LinkButton size="small" variant="primary" href="/runners/new">Connect a runner</LinkButton
          >{/if}
      </EmptyState>
    {/each}
  </section>
</Page>
