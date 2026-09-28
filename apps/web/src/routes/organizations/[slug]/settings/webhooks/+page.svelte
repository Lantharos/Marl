<script lang="ts">
  import OrganizationSettingsShell from '$lib/components/settings/shells/OrganizationSettingsShell.svelte';
  import WebhookSettings from '$lib/components/settings/webhooks/WebhookSettings.svelte';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
</script>

<svelte:head><title>Webhooks · {data.organization.name} · Marl</title></svelte:head>
<OrganizationSettingsShell
  name={data.organization.name}
  slug={data.organization.slug}
  avatarUrl={data.organization.avatarUrl}
  active="webhooks"
>
  <WebhookSettings
    initialWebhooks={data.webhooks}
    endpoint="/organizations/{data.organization.slug}/webhooks"
    scope="organization"
  />
</OrganizationSettingsShell>
