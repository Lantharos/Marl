<script lang="ts">
  import RepositoryRuns from '#lib/runs/list/RepositoryRuns.svelte';
  import type { PageProps } from './$types';

  let { data, params }: PageProps = $props();
</script>

<svelte:head><title>{data.workflow.name} · {params.owner}/{params.repo} · Marl</title></svelte:head>

<RepositoryRuns
  owner={params.owner}
  repository={params.repo}
  workflows={data.workflows}
  workflowId={data.workflow.id}
  runs={data.runs}
  nextCursor={data.nextCursor}
  state={data.state}
  query={data.query}
  canDispatch={data.repository.permissions.push}
/>
