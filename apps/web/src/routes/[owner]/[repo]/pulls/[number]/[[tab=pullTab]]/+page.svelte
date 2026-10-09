<script lang="ts">
  import PullDiscussionPage from '#lib/pulls/detail/PullDiscussionPage.svelte';
  import type { PageProps } from './$types';

  let { data, params }: PageProps = $props();
</script>

{#key `${data.pull.id}:${data.shellUser?.id ?? 'anonymous'}`}
  <PullDiscussionPage
    route={{ owner: params.owner, repo: params.repo, number: Number(params.number) }}
    pull={data.pull}
    tab={params.tab ?? 'overview'}
    viewerId={data.shellUser?.id}
    publicRepository={data.repository.visibility === 'public'}
  />
{/key}
