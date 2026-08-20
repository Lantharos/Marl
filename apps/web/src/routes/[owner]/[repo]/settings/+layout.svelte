<script lang="ts">
  import { page } from '$app/stores';
  import RepositorySettingsShell from '$lib/components/settings/RepositorySettingsShell.svelte';

  let { children } = $props<{ children: import('svelte').Snippet }>();
  const owner = $derived($page.params.owner ?? '');
  const repository = $derived($page.params.repo ?? '');
</script>

<RepositorySettingsShell {owner} {repository}>{@render children()}</RepositorySettingsShell>
