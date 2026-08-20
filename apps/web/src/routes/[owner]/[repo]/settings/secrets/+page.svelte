<script lang="ts">
  import { page } from '$app/stores';
  import SecretSettings from '$lib/components/settings/SecretSettings.svelte';
  import type { PageData } from './$types';
  let { data } = $props<{ data: PageData }>();
</script>

<svelte:head><title>Secrets · {$page.params.owner}/{$page.params.repo} · Marl</title></svelte:head>
<SecretSettings initialSecrets={data.secrets} endpoint={`/repositories/${$page.params.owner}/${$page.params.repo}/secrets`} scope="repository" />
