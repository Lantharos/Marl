<script lang="ts">
  import { page } from '$app/state';
  import WebhookSettings from '$lib/components/settings/webhooks/WebhookSettings.svelte';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
</script>

<svelte:head><title>Webhooks · {page.params.owner}/{page.params.repo} · Marl</title></svelte:head>
<WebhookSettings
  initialWebhooks={data.webhooks}
  endpoint="/repositories/{page.params.owner}/{page.params.repo}/webhooks"
  scope="repository"
/>
