<script lang="ts">
  import QueuePage from '#lib/workspace/queue/QueuePage.svelte';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();
</script>

<QueuePage kind="pull" viewerId={data.shellUser?.id ?? ''} />
