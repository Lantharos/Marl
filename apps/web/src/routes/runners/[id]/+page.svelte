<script lang="ts">
  import Cpu from '@lucide/svelte/icons/cpu';
  import BackLink from '$lib/components/page/BackLink.svelte';
  import Page from '$lib/components/page/Page.svelte';
  import Time from '$lib/components/page/Time.svelte';
  import RunnerStatus from '$lib/runs/RunnerStatus.svelte';
  import type { PageData } from './$types';
  let { data }: { data: PageData } = $props();
  const runner = $derived(data.runner);
</script>

<svelte:head><title>{runner?.name ?? 'Runner'} · Marl</title></svelte:head>
<Page width="narrow">
  <BackLink href="/runners" label="Runners" />
  <header class="mt-5 mb-6 grid grid-cols-[44px_minmax(0,1fr)_auto] items-center gap-3.5">
    <span class="grid size-11 place-items-center rounded-xl bg-surface-muted text-ink-muted"><Cpu size={22} /></span>
    <div class="min-w-0">
      <h1 class="truncate text-2xl font-semibold tracking-tight text-ink-strong">{runner.name}</h1>
      <p class="mt-0.5 text-sm text-ink-muted">{runner.platform} {runner.architecture} · runner {runner.version}</p>
    </div>
    <RunnerStatus state={runner.state} />
  </header>
  <dl class="divide-y divide-line-subtle surface px-4 sm:px-5">
    {#snippet row(term: string)}<dt class="text-sm text-ink-muted">{term}</dt>{/snippet}
    <div class="grid gap-1 py-4 sm:grid-cols-[160px_minmax(0,1fr)]">
      {@render row('Capacity')}
      <dd class="text-sm text-ink-strong">{runner.activeJobs} of {runner.concurrency} jobs active</dd>
    </div>
    <div class="grid gap-1 py-4 sm:grid-cols-[160px_minmax(0,1fr)]">
      {@render row('Last seen')}
      <dd><Time value={runner.lastSeenAt} class="text-sm text-ink-strong" /></dd>
    </div>
    <div class="grid gap-1 py-4 sm:grid-cols-[160px_minmax(0,1fr)]">
      {@render row('Labels')}
      <dd class="flex flex-wrap gap-1">
        {#each runner.labels as label (label)}<code
            class="rounded bg-surface-muted px-1.5 py-0.5 font-mono text-xs text-ink">{label}</code
          >{/each}
      </dd>
    </div>
    <div class="grid gap-1 py-4 sm:grid-cols-[160px_minmax(0,1fr)]">
      {@render row('Runner ID')}
      <dd><code class="font-mono text-xs break-all text-ink">{runner.id}</code></dd>
    </div>
  </dl>
</Page>
