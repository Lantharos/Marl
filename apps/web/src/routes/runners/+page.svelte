<script lang="ts">
  import type { RunnerSummary } from '@sty/contracts';
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

<svelte:head><title>Runners · Sty</title></svelte:head>
<main class="page">
  <PageHeader title="Runners" description="Your machines. Every job isolated in Docker." actionHref="/runners/new" actionLabel="Connect runner" />
  <div class="summary"><span><strong>{runners.length}</strong> connected</span><span><strong>{active}</strong> active {active === 1 ? 'job' : 'jobs'}</span>{#if offline}<span class="warn"><CircleAlert size={12} /><strong>{offline}</strong> offline</span>{/if}</div>
  <FilterBar placeholder="Find a runner" tabs={['All', 'Idle', 'Busy', 'Offline']} bind:active={activeFilter} bind:query />
  <section class="list">
    {#each filteredRunners as runner}
      <a class="row" href="/runners/{runner.id}"><span class="machine"><Cpu size={17} /></span><span class="identity"><strong>{runner.name}</strong><small>{runner.platform} {runner.architecture} · v{runner.version}</small></span><span class="labels">{#each runner.labels as label}<code>{label}</code>{/each}</span><span class="capacity"><b>{runner.activeJobs}/{runner.concurrency}</b><i><span style:width={`${runner.activeJobs / runner.concurrency * 100}%`}></span></i></span><span class="status {runner.state}"><i></i>{runner.state}</span></a>
    {:else}<div class="empty"><Cpu size={20} /><strong>No matching runners</strong><p>Try another status, name, or label.</p></div>{/each}
  </section>
</main>

<style>
  .page{width:min(1060px,calc(100% - 56px));margin:0 auto;padding:48px 0 72px}.summary{display:flex;gap:16px;margin-bottom:8px;color:var(--text-faint);font-size:9px}.summary span{display:inline-flex;align-items:center;gap:4px}.summary strong{color:var(--text-muted)}.summary .warn{color:var(--danger)}.row{display:grid;grid-template-columns:32px minmax(160px,1fr) minmax(120px,auto) 90px 65px;align-items:center;gap:11px;min-height:67px;padding:9px 4px;border-bottom:1px solid var(--border-subtle);color:inherit;text-decoration:none}.row:hover{background:var(--surface-hover)}.machine{display:grid;width:29px;height:29px;place-items:center;color:var(--text-muted)}.identity strong,.identity small{display:block}.identity strong{color:var(--text-strong);font-size:11px}.identity small{margin-top:3px;color:var(--text-faint);font-size:9px}.labels{display:flex;flex-wrap:wrap;gap:4px}.labels code{padding:2px 5px;border-radius:4px;background:var(--surface-muted);color:var(--text-muted);font-size:8px}.capacity{display:grid;grid-template-columns:30px 1fr;align-items:center;gap:6px;color:var(--text-faint);font-size:8px}.capacity b{font-weight:500}.capacity>i{overflow:hidden;height:3px;background:var(--surface-muted)}.capacity>i span{display:block;height:100%;background:var(--brand)}.status{display:flex;align-items:center;gap:5px;color:var(--text-muted);font-size:9px;text-transform:capitalize}.status>i{width:6px;height:6px;border-radius:50%;background:var(--success)}.status.busy>i{background:var(--brand)}.status.offline{color:var(--danger)}.status.offline>i{background:var(--danger)}.notice{color:var(--warning);font-size:10px}.empty{padding:50px 4px;color:var(--text-faint);text-align:center}.empty strong{display:block;margin-top:8px;color:var(--text-strong);font-size:12px}.empty p{font-size:10px}@media(max-width:760px){.page{width:calc(100% - 28px);padding-top:32px}.row{grid-template-columns:32px minmax(0,1fr) 60px}.labels,.capacity{display:none}}
</style>
