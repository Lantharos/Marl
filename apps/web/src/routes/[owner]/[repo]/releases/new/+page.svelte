<script lang="ts">
  import ReleaseForm from '#lib/releases/editor/ReleaseForm.svelte';
  import type { PageProps } from './$types';
  let { data, params }: PageProps = $props();
  const { branches, tags } = $derived(data);
</script>

<svelte:head><title>New release · {params.owner}/{params.repo} · Marl</title></svelte:head>
{#key `${params.owner}/${params.repo}`}<ReleaseForm
    owner={params.owner}
    repository={params.repo}
    defaultBranch={data.repository.defaultBranch}
    {branches}
    {tags}
  />{/key}
