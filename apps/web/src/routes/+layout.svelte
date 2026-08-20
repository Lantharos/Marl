<script lang="ts">
  import { onMount } from 'svelte';
  import '../app.css';
  import { registerElevationHandler } from '$lib/auth/elevation';
  import { IdentityConfirmation } from '$lib/auth/identity-confirmation.svelte';
  import IdentityConfirmationModal from '$lib/components/auth/IdentityConfirmationModal.svelte';
  import AppShell from '$lib/components/shell/AppShell.svelte';
  import NavigationProgress from '$lib/components/shell/NavigationProgress.svelte';
  import type { LayoutData } from './$types';

  let { data, children } = $props<{ data: LayoutData; children: import('svelte').Snippet }>();
  const confirmation = new IdentityConfirmation();

  onMount(() => registerElevationHandler(confirmation.confirm));
</script>

<NavigationProgress />
{#if data.shellUser}
  <AppShell repositories={data.shellRepositories} organizations={data.shellOrganizations} user={data.shellUser}>
    {@render children()}
  </AppShell>
{:else}
  {@render children()}
{/if}
<IdentityConfirmationModal open={confirmation.open} method={confirmation.method} description={confirmation.description} onClose={confirmation.close} onVerified={confirmation.continue} />
