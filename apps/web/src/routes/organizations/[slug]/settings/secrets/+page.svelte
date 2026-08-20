<script lang="ts">
  import { page } from '$app/stores';
  import OrganizationSettingsShell from '$lib/components/OrganizationSettingsShell.svelte';
  import SecretSettings from '$lib/components/SecretSettings.svelte';
  import type { PageData } from './$types';
  let { data } = $props<{ data: PageData }>();
  const slug = $derived($page.params.slug ?? '');
</script>

<svelte:head><title>CI secrets · {data.organizationName} · Marl</title></svelte:head>
<OrganizationSettingsShell name={data.organizationName} {slug} active="secrets"><SecretSettings initialSecrets={data.secrets} endpoint={`/organizations/${slug}/secrets`} scope="organization" /></OrganizationSettingsShell>
