<script lang="ts">
  import '../app.css';
  import AppShell from '$lib/components/shell/AppShell.svelte';
  import NavigationProgress from '$lib/components/shell/NavigationProgress.svelte';
  import type { LayoutData } from './$types';

  let { data, children } = $props<{ data: LayoutData; children: import('svelte').Snippet }>();
</script>

<NavigationProgress />
{#if data.shellUser}
  <AppShell repositories={data.shellRepositories} organizations={data.shellOrganizations} user={data.shellUser}>
    {@render children()}
  </AppShell>
{:else}
  {@render children()}
{/if}
