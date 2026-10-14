<script lang="ts">
  import ItemPanes from '#lib/workspace/canvas/ItemPanes.svelte';
  import { routeRef } from '#lib/workspace/store/refs.js';
  import type { PageProps } from './$types';

  let { data, params }: PageProps = $props();
  const ref = $derived(routeRef('pull', params));
</script>

<svelte:head><title>!{params.number} · {params.owner}/{params.repo} · Marl</title></svelte:head>

<ItemPanes {ref} viewerId={data.shellUser?.id ?? ''} />
