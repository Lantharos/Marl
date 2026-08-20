<script lang="ts">
  import type { RunnerSummary } from '@marl/contracts';
  import CircleAlert from 'lucide-svelte/icons/circle-alert';
  import Cpu from 'lucide-svelte/icons/cpu';
  import FilterBar from '$lib/components/FilterBar.svelte';
  import PageHeader from '$lib/components/PageHeader.svelte';
  import type { PageData } from './$types';
  let { data } = $props<{ data: PageData }>();
  const runners = $derived(data.runners as RunnerSummary[]);
  let query = $state('');
  let activeFilter = $state('All');
  const active = $derived(runners.reduce((sum, runner) => sum + runner.activeJobs, 0));
  const offline = $derived(runners.filter((runner) => runner.state === 'offline').length);
  const filteredRunners = $derived(runners.filter((runner) => (activeFilter === 'All' || runner.state === activeFilter.toLowerCase()) && `${runner.name} ${runner.platform} ${runner.architecture} ${runner.labels.join(' ')}`.toLowerCase().includes(query.trim().toLowerCase())));

</script>

<svelte:head><title>Runners · Marl</title></svelte:head>
<main class="page">
  <PageHeader title="Runners" description="Your machines. Every job isolated in Docker." actionHref="/runners/new" actionLabel="Connect runner" />
  <div class="summary"><span><strong>{runners.length}</strong> connected</span><span><strong>{active}</strong> active {active === 1 ? 'job' : 'jobs'}</span>{#if offline}<span class="warn"><CircleAlert size={12} /><strong>{offline}</strong> offline</span>{/if}</div>
  <FilterBar placeholder="Find a runner" tabs={['All', 'Idle', 'Busy', 'Offline']} bind:active={activeFilter} bind:query />
  <section class="list">
    {#each filteredRunners as runner}
      <a class="row" href="/runners/{runner.id}"><span class="machine"><Cpu size={17} /></span><span class="identity"><strong>{runner.name}</strong><small>{runner.platform} {runner.architecture} · v{runner.version}</small></span><span class="labels">{#each runner.labels as label}<code>{label}</code>{/each}</span><span class="capacity"><b>{runner.activeJobs}/{runner.concurrency}</b><i><span style:width={`${runner.activeJobs / runner.concurrency * 100}%`}></span></i></span><span class="status {runner.state}"><i></i>{runner.state}</span></a>
    {:else}<div class="empty"><Cpu size={24} /><strong>{runners.length ? 'No matching runners' : 'Connect your first runner'}</strong><p>{runners.length ? 'Try another status, name, or label.' : 'Install Marl Runner on a machine with Git and Docker, then enroll it here.'}</p>{#if !runners.length}<a href="/runners/new">Connect a runner</a>{/if}</div>{/each}
  </section>
</main>

<style>
  .page{width:min(920px,calc(100% - 48px));margin:0 auto;padding:44px 0 72px}.summary{display:flex;gap:18px;margin-bottom:9px;color:var(--text-muted);font-size:11px}.summary span{display:inline-flex;align-items:center;gap:5px}.summary strong{color:var(--text)}.summary .warn{color:var(--danger)}.list{display:grid;gap:4px}.row{display:grid;grid-template-columns:38px minmax(160px,1fr) minmax(100px,auto) 90px 68px;align-items:center;gap:12px;min-height:78px;padding:10px 12px;border-radius:8px;color:inherit;text-decoration:none;transition:background-color 120ms ease}.row:hover{background:var(--surface-hover)}.machine{display:grid;width:34px;height:34px;place-items:center;border-radius:8px;background:var(--surface-muted);color:var(--text)}.identity strong,.identity small{display:block}.identity strong{color:var(--text-strong);font-size:13px}.identity small{margin-top:4px;color:var(--text-muted);font-size:10px}.labels{display:flex;flex-wrap:wrap;gap:5px}.labels code{padding:3px 6px;border-radius:999px;background:var(--surface-muted);color:var(--text);font-size:9px}.capacity{display:grid;grid-template-columns:32px 1fr;align-items:center;gap:7px;color:var(--text-muted);font-size:10px}.capacity b{font-weight:500}.capacity>i{overflow:hidden;height:4px;border-radius:999px;background:var(--surface-muted)}.capacity>i span{display:block;height:100%;background:var(--brand)}.status{display:flex;align-items:center;gap:6px;color:var(--text);font-size:10px;text-transform:capitalize}.status>i{width:7px;height:7px;border-radius:50%;background:var(--success)}.status.busy>i{background:var(--brand)}.status.offline{color:var(--danger)}.status.offline>i{background:var(--danger)}.empty{padding:70px 4px;color:var(--text-muted);text-align:center}.empty strong{display:block;margin-top:10px;color:var(--text-strong);font-size:15px}.empty p{margin:7px 0 0;font-size:12px}.empty a{display:inline-flex;margin-top:16px;color:var(--brand-strong);font-size:12px;text-decoration:none}@media(max-width:760px){.page{width:calc(100% - 28px);padding-top:32px}.row{grid-template-columns:38px minmax(0,1fr) 70px;padding-inline:6px}.labels,.capacity{display:none}}
</style>
