<script lang="ts">
  import { page } from '$app/state';
  import OrganizationSettingsShell from '$lib/components/settings/shells/OrganizationSettingsShell.svelte';
  import SecretSettings from '$lib/components/settings/panels/SecretSettings.svelte';
  import type { PageData } from './$types';
  let { data }: { data: PageData } = $props();
  const slug = $derived(page.params.slug ?? '');
</script>

<svelte:head><title>CI secrets · {data.organizationName} · Marl</title></svelte:head>
<OrganizationSettingsShell name={data.organizationName} {slug} avatarUrl={data.organizationAvatarUrl} active="secrets"
  ><SecretSettings
    initialSecrets={data.secrets}
    endpoint={`/organizations/${slug}/secrets`}
    scope="organization"
  /></OrganizationSettingsShell
>
