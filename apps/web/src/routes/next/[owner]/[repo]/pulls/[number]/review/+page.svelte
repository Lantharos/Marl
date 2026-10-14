<script lang="ts">
  import ReviewMode from '#lib/workspace/review/ReviewMode.svelte';
  import { routeRef } from '#lib/workspace/store/refs.js';
  import type { PageProps } from './$types';

  let { data, params }: PageProps = $props();
  const ref = $derived(routeRef('pull', params));
</script>

<svelte:head><title>Review !{params.number} · {params.owner}/{params.repo} · Marl</title></svelte:head>

{#key `${params.owner}/${params.repo}/${params.number}`}
  <ReviewMode {ref} viewerId={data.shellUser?.id ?? ''} />
{/key}
