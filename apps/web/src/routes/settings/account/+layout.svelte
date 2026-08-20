<script lang="ts">
  import AccountSettingsShell from '$lib/components/settings/AccountSettingsShell.svelte';
  let { children } = $props<{ children: import('svelte').Snippet }>();
</script>

<AccountSettingsShell>{@render children()}</AccountSettingsShell>
