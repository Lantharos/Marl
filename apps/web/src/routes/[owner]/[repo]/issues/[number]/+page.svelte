<script lang="ts">
  import IssueDiscussionPage from '#lib/issues/IssueDiscussionPage.svelte';
  import type { PageProps } from './$types';

  let { data, params }: PageProps = $props();
</script>

{#key `${data.issue.id}:${data.shellUser?.id ?? 'anonymous'}`}
  <IssueDiscussionPage {data} {params} />
{/key}
