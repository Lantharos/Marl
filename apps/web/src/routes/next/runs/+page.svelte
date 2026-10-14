<script lang="ts">
  import RunFeed from '#lib/runs/list/RunFeed.svelte';
  import CanvasFrame from '#lib/workspace/canvas/CanvasFrame.svelte';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();
  const title = $derived(data.repository ?? 'Runs');
</script>

<svelte:head><title>{title} · Marl</title></svelte:head>

<CanvasFrame details={false}>
  <div class="mx-auto w-full max-w-240 px-4 pb-16 sm:px-8">
    <h1 class="mb-4 text-2xl font-semibold tracking-tight text-ink-strong">{title}</h1>
    <RunFeed
      runs={data.runs}
      nextCursor={data.nextCursor}
      endpoint={data.endpoint}
      state={data.state}
      query={data.query}
      showRepository={!data.repository}
      emptyDescription="Connect a runner and push a workflow to start your first run."
    />
  </div>
</CanvasFrame>
