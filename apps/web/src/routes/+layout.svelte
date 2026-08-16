<script lang="ts">
  import '../app.css';
  import AppShell from '$lib/components/AppShell.svelte';
  import NavigationProgress from '$lib/components/NavigationProgress.svelte';
  import type { LayoutData } from './$types';

  let { data, children } = $props<{ data: LayoutData; children: import('svelte').Snippet }>();
</script>

<NavigationProgress />
<AppShell repositories={data.shellRepositories}>
  {@render children()}
</AppShell>
