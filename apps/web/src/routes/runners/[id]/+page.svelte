<script lang="ts">
  import Cpu from 'lucide-svelte/icons/cpu';
  import BackLink from '$lib/components/BackLink.svelte';
  import Time from '$lib/components/Time.svelte';
  import type { PageData } from './$types';
  let { data } = $props<{ data: PageData }>();
  const runner = $derived(data.runner);
</script>

<svelte:head><title>{runner?.name ?? 'Runner'} · Marl</title></svelte:head>
<main class="page">
  <BackLink href="/runners" label="Runners" />
  <header><span class="machine"><Cpu size={21} /></span><div><h1>{runner.name}</h1><p>{runner.platform} {runner.architecture} · runner {runner.version}</p></div><span class="status {runner.state}"><i></i>{runner.state}</span></header>
  <dl><div><dt>Capacity</dt><dd>{runner.activeJobs} of {runner.concurrency} jobs active</dd></div><div><dt>Last seen</dt><dd><Time value={runner.lastSeenAt} /></dd></div><div><dt>Labels</dt><dd class="labels">{#each runner.labels as label}<code>{label}</code>{/each}</dd></div><div><dt>Runner ID</dt><dd><code>{runner.id}</code></dd></div></dl>
</main>

<style>
  .page{width:min(820px,calc(100% - 40px));margin:0 auto;padding:43px 0 72px}.page>header{display:grid;grid-template-columns:42px minmax(0,1fr) auto;align-items:center;gap:12px;margin-top:24px;padding-bottom:22px;border-bottom:1px solid var(--border)}.machine{display:grid;width:40px;height:40px;place-items:center;border-radius:8px;background:var(--surface-muted);color:var(--text-muted)}h1{margin:0;color:var(--text-strong);font-size:22px;letter-spacing:-.03em}header p{margin:5px 0 0;color:var(--text-faint);font-size:10px}.status{display:flex;align-items:center;gap:6px;color:var(--text-muted);font-size:10px;text-transform:capitalize}.status i{width:7px;height:7px;border-radius:50%;background:var(--success)}.status.busy i{background:var(--brand)}.status.offline{color:var(--danger)}.status.offline i{background:var(--danger)}dl{margin:0}dl>div{display:grid;grid-template-columns:150px 1fr;gap:20px;padding:16px 2px;border-bottom:1px solid var(--border-subtle)}dt{color:var(--text-faint);font-size:10px}dd{margin:0;color:var(--text);font-size:11px}.labels{display:flex;flex-wrap:wrap;gap:5px}code{padding:2px 5px;border-radius:4px;background:var(--surface-muted);color:var(--text-muted);font-size:9px}.error{margin-top:28px;color:var(--danger);font-size:11px}@media(max-width:600px){.page>header{grid-template-columns:42px 1fr}.status{grid-column:2}dl>div{grid-template-columns:1fr;gap:6px}}
</style>
