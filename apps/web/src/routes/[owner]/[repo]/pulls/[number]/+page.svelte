<script lang="ts">
  import PullDiscussionPage from '$lib/pulls/detail/PullDiscussionPage.svelte';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
</script>

{#key `${data.pull.id}:${data.shellUser?.id ?? 'anonymous'}`}
  <PullDiscussionPage
    pull={data.pull}
    viewerId={data.shellUser?.id}
    publicRepository={data.repository.visibility === 'public'}
  />
{/key}
