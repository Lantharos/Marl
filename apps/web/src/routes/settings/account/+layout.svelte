<script lang="ts">
  import SettingsShell from '$lib/components/SettingsShell.svelte';
  let { children } = $props<{ children: import('svelte').Snippet }>();
</script>

<SettingsShell>{@render children()}</SettingsShell>
