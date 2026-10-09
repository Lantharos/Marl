<script lang="ts">
  import ReleaseForm from '#lib/releases/ReleaseForm.svelte';
  import type { PageProps } from './$types';
  let { data, params }: PageProps = $props();
  const { branches, tags, release } = $derived(data);
</script>

<svelte:head><title>Edit {release.name || release.tagName} · {params.owner}/{params.repo} · Marl</title></svelte:head>
{#key `${params.owner}/${params.repo}/${release.id}`}<ReleaseForm
    owner={params.owner}
    repository={params.repo}
    {branches}
    {tags}
    {release}
  />{/key}
