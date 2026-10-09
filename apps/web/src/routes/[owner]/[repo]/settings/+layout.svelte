<script lang="ts">
  import RepositorySettingsShell from '#lib/components/settings/shells/RepositorySettingsShell.svelte';
  import type { LayoutProps } from './$types';

  let { children, params }: LayoutProps = $props();
</script>

<RepositorySettingsShell owner={params.owner} repository={params.repo}>{@render children()}</RepositorySettingsShell>
