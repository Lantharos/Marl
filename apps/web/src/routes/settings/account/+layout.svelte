<script lang="ts">
  import type { Snippet } from 'svelte';
  import AccountSettingsShell from '$lib/components/settings/shells/AccountSettingsShell.svelte';

  let { children }: { children: Snippet } = $props();
</script>

<AccountSettingsShell>{@render children()}</AccountSettingsShell>
