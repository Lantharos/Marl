<script lang="ts">
  import AgentSettings from '#lib/components/settings/agents/AgentSettings.svelte';
  import OrganizationSettingsShell from '#lib/components/settings/shells/OrganizationSettingsShell.svelte';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
  const { agents } = $derived(data);
</script>

<svelte:head><title>Agents · {data.organization.name} · Marl</title></svelte:head>
<OrganizationSettingsShell
  name={data.organization.name}
  slug={data.organization.slug}
  avatarUrl={data.organization.avatarUrl}
  active="agents"
>
  <AgentSettings initialAgents={agents} endpoint="/organizations/{data.organization.slug}/agents" />
</OrganizationSettingsShell>
