<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/state';
  import { refreshAll } from '$app/navigation';
  import '../app.css';
  import { registerElevationHandler } from '#lib/auth/elevation.js';
  import { IdentityConfirmation } from '#lib/auth/identity-confirmation.svelte.js';
  import IdentityConfirmationModal from '#lib/components/auth/IdentityConfirmationModal.svelte';
  import AppShell from '#lib/components/shell/AppShell.svelte';
  import LegalUpdateNotice from '#lib/legal/LegalUpdateNotice.svelte';
  import ReportDialog from '#lib/reporting/ReportDialog.svelte';
  import NavigationProgress from '#lib/components/shell/NavigationProgress.svelte';
  import { isIndexableRepositoryPath, privateRoots } from '#lib/repositories/repository-route.js';
  import { watchShellChanges } from '#lib/shell-cache.js';
  import type { LayoutData } from './$types';

  let { data, children }: { data: LayoutData; children: import('svelte').Snippet } = $props();
  const authRoutes = new Set(['/sign-in', '/sign-up', '/forgot-password', '/reset-password', '/two-factor']);
  const confirmation = new IdentityConfirmation();
  const workspace = $derived(page.route.id?.startsWith('/next') ?? false);
  const indexable = $derived.by(() => {
    const parts = page.url.pathname.split('/').filter(Boolean);
    const repository = (page.data as { repository?: { visibility?: string } }).repository;
    return (
      (parts.length === 3 && parts[1] === '-' && parts[2] === 'repositories' && !privateRoots.has(parts[0])) ||
      parts.length === 0 ||
      (parts.length <= 2 && !privateRoots.has(parts[0])) ||
      (repository?.visibility === 'public' && isIndexableRepositoryPath(page.url.pathname))
    );
  });

  onMount(() => {
    const stopElevation = registerElevationHandler(confirmation.confirm);
    const stopShellUpdates = watchShellChanges(() => void refreshAll());
    return () => {
      stopElevation();
      stopShellUpdates();
    };
  });
</script>

<svelte:head
  >{#if !indexable}<meta name="robots" content="noindex, nofollow" />{/if}</svelte:head
>

<NavigationProgress />
{#if data.shellUser && !page.error && !workspace}
  <AppShell repositories={data.shellRepositories} organizations={data.shellOrganizations} user={data.shellUser}>
    {#if !data.shellLegalAccepted}<LegalUpdateNotice />{/if}
    {@render children()}
  </AppShell>
{:else}
  {@render children()}
{/if}
{#if data.shellUser}<ReportDialog />{/if}
<IdentityConfirmationModal
  open={confirmation.open}
  method={confirmation.method}
  description={confirmation.description}
  onClose={confirmation.close}
  onVerified={confirmation.continue}
/>
