<script lang="ts">
  import OrganizationSettingsShell from '#lib/components/settings/shells/OrganizationSettingsShell.svelte';
  import SecretSettings from '#lib/components/settings/panels/SecretSettings.svelte';
  import type { PageProps } from './$types';
  let { data, params }: PageProps = $props();
  const { secrets } = $derived(data);
</script>

<svelte:head><title>CI secrets · {data.organizationName} · Marl</title></svelte:head>
<OrganizationSettingsShell
  name={data.organizationName}
  slug={params.slug}
  avatarUrl={data.organizationAvatarUrl}
  active="secrets"
  ><SecretSettings
    initialSecrets={secrets}
    endpoint={`/organizations/${params.slug}/secrets`}
    scope="organization"
  /></OrganizationSettingsShell
>
