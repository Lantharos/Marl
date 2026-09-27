<script lang="ts">
  import AgentSettings from '$lib/components/settings/agents/AgentSettings.svelte';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
</script>

<svelte:head><title>Agents · Marl</title></svelte:head>
<AgentSettings initialAgents={data.agents} endpoint={data.endpoint} />
