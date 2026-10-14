<script lang="ts">
  import QueuePage from '#lib/workspace/queue/QueuePage.svelte';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();
</script>

<QueuePage kind="issue" viewerId={data.shellUser?.id ?? ''} />
