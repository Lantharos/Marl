<script lang="ts">
  import SecretSettings from '#lib/components/settings/panels/SecretSettings.svelte';
  import type { PageProps } from './$types';
  let { data, params }: PageProps = $props();
  const { secrets } = $derived(data);
</script>

<svelte:head><title>Secrets · {params.owner}/{params.repo} · Marl</title></svelte:head>
<SecretSettings
  initialSecrets={secrets}
  endpoint={`/repositories/${params.owner}/${params.repo}/secrets`}
  scope="repository"
/>
