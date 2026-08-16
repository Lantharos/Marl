<script lang="ts">
  import '../app.css';
  import AppShell from '$lib/components/AppShell.svelte';
  import type { LayoutData } from './$types';

  let { data, children } = $props<{ data: LayoutData; children: import('svelte').Snippet }>();
</script>

<AppShell repositories={data.shellRepositories}>
  {@render children()}
</AppShell>
