<script lang="ts">
  import { page } from '$app/state';
  import SecretSettings from '$lib/components/settings/panels/SecretSettings.svelte';
  import type { PageData } from './$types';
  let { data }: { data: PageData } = $props();
</script>

<svelte:head><title>Secrets · {page.params.owner}/{page.params.repo} · Marl</title></svelte:head>
<SecretSettings
  initialSecrets={data.secrets}
  endpoint={`/repositories/${page.params.owner}/${page.params.repo}/secrets`}
  scope="repository"
/>
