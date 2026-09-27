<script lang="ts">
  import { page } from '$app/state';
  import ReleaseForm from '$lib/releases/ReleaseForm.svelte';
  import type { PageData } from './$types';
  let { data }: { data: PageData } = $props();
</script>

<svelte:head><title>New release · {page.params.owner}/{page.params.repo} · Marl</title></svelte:head>
{#key `${page.params.owner}/${page.params.repo}`}<ReleaseForm
    owner={page.params.owner ?? ''}
    repository={page.params.repo ?? ''}
    branches={data.branches}
    tags={data.tags}
  />{/key}
