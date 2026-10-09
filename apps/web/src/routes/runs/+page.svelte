<script lang="ts">
  import LinkButton from '#lib/components/controls/LinkButton.svelte';
  import Page from '#lib/components/page/Page.svelte';
  import PageHeader from '#lib/components/page/PageHeader.svelte';
  import RunFeed from '#lib/runs/list/RunFeed.svelte';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();
</script>

<svelte:head><title>Runs · Marl</title></svelte:head>

<Page>
  <PageHeader title="Runs" />
  <RunFeed
    runs={data.runs}
    nextCursor={data.nextCursor}
    endpoint="/runs"
    state={data.state}
    query={data.query}
    showRepository
    emptyDescription="Connect a runner and push a workflow to start your first run."
  >
    {#snippet empty()}<LinkButton size="small" variant="primary" href="/runners/new">Connect a runner</LinkButton
      >{/snippet}
  </RunFeed>
</Page>
