<script lang="ts">
  import IssueDiscussionPage from '$lib/issues/IssueDiscussionPage.svelte';
  import type { PageData } from './$types';

  let { data } = $props<{ data: PageData }>();
</script>

{#key `${data.issue.id}:${data.shellUser?.id ?? 'anonymous'}`}
  <IssueDiscussionPage {data} />
{/key}
