<script lang="ts">
  import WebhookSettings from '#lib/components/settings/webhooks/WebhookSettings.svelte';
  import type { PageProps } from './$types';

  let { data, params }: PageProps = $props();
  const { webhooks } = $derived(data);
</script>

<svelte:head><title>Webhooks · {params.owner}/{params.repo} · Marl</title></svelte:head>
<WebhookSettings
  initialWebhooks={webhooks}
  endpoint="/repositories/{params.owner}/{params.repo}/webhooks"
  scope="repository"
/>
