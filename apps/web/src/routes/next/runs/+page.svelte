<script lang="ts">
  import RunFeed from '#lib/runs/list/RunFeed.svelte';
  import CanvasFrame from '#lib/workspace/canvas/CanvasFrame.svelte';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();
</script>

<svelte:head><title>Runs · Marl</title></svelte:head>

<CanvasFrame details={false}>
  <div class="mx-auto w-full max-w-240 px-4 pb-16 sm:px-8">
    <h1 class="mb-4 text-2xl font-semibold tracking-tight text-ink-strong">Runs</h1>
    <RunFeed
      runs={data.runs}
      nextCursor={data.nextCursor}
      endpoint="/runs"
      state={data.state}
      query={data.query}
      showRepository
      emptyDescription="Connect a runner and push a workflow to start your first run."
    />
  </div>
</CanvasFrame>
