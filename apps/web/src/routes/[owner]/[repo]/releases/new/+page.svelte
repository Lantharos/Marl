<script lang="ts">
  import { page } from '$app/stores';
  import ReleaseForm from '$lib/releases/ReleaseForm.svelte';
  import type { PageData } from './$types';
  let { data } = $props<{ data: PageData }>();
</script>

<svelte:head><title>New release · {$page.params.owner}/{$page.params.repo} · Marl</title></svelte:head>
{#key `${$page.params.owner}/${$page.params.repo}`}<ReleaseForm owner={$page.params.owner ?? ''} repository={$page.params.repo ?? ''} branches={data.branches} tags={data.tags} />{/key}
