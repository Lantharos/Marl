<script lang="ts">
  import type { Snippet } from 'svelte';
  import { page } from '$app/state';
  import RepositorySettingsShell from '$lib/components/settings/shells/RepositorySettingsShell.svelte';

  let { children }: { children: Snippet } = $props();
  const owner = $derived(page.params.owner ?? '');
  const repository = $derived(page.params.repo ?? '');
</script>

<RepositorySettingsShell {owner} {repository}>{@render children()}</RepositorySettingsShell>
