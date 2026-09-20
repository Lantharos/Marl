<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/state';
  import { invalidateAll } from '$app/navigation';
  import '../app.css';
  import '$lib/styles/controls.css';
  import { registerElevationHandler } from '$lib/auth/elevation';
  import { IdentityConfirmation } from '$lib/auth/identity-confirmation.svelte';
  import IdentityConfirmationModal from '$lib/components/auth/IdentityConfirmationModal.svelte';
  import AppShell from '$lib/components/shell/AppShell.svelte';
  import NavigationProgress from '$lib/components/shell/NavigationProgress.svelte';
  import { isIndexableRepositoryPath } from '$lib/repository-route';
  import { applyTheme, readTheme } from '$lib/theme';
  import { watchShellChanges } from '$lib/shell-cache';
  import type { LayoutData } from './$types';

  let { data, children } = $props<{ data: LayoutData; children: import('svelte').Snippet }>();
  const confirmation = new IdentityConfirmation();
  const privateRoots = new Set(['forgot-password', 'inbox', 'invitations', 'issues', 'organizations', 'pulls', 'repositories', 'reset-password', 'runners', 'runs', 'settings', 'sign-in', 'sign-up', 'two-factor']);
  const indexable = $derived.by(() => {
    const parts = page.url.pathname.split('/').filter(Boolean);
    const repository = (page.data as { repository?: { visibility?: string } }).repository;
    return (parts.length === 3 && parts[1] === '-' && parts[2] === 'repositories' && !privateRoots.has(parts[0]))
      || parts.length === 0
      || (parts.length <= 2 && !privateRoots.has(parts[0]))
      || (repository?.visibility === 'public' && isIndexableRepositoryPath(page.url.pathname));
  });

  onMount(() => {
    applyTheme(readTheme());
    const stopElevation = registerElevationHandler(confirmation.confirm);
    const stopShellUpdates = watchShellChanges(() => void invalidateAll());
    return () => { stopElevation(); stopShellUpdates(); };
  });
</script>

<svelte:head>{#if !indexable}<meta name="robots" content="noindex, nofollow" />{/if}</svelte:head>

<NavigationProgress />
{#if data.shellUser && !page.error}
  <AppShell repositories={data.shellRepositories} organizations={data.shellOrganizations} user={data.shellUser}>
    {@render children()}
  </AppShell>
{:else}
  {@render children()}
{/if}
<IdentityConfirmationModal open={confirmation.open} method={confirmation.method} description={confirmation.description} onClose={confirmation.close} onVerified={confirmation.continue} />
