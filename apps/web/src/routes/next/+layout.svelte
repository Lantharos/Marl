<script lang="ts">
  import Shell from '#lib/workspace/shell/Shell.svelte';
  import type { LayoutProps } from './$types';

  let { data, children }: LayoutProps = $props();
</script>

{#if data.shellUser}
  <Shell user={data.shellUser} repositories={data.shellRepositories} legalAccepted={data.shellLegalAccepted}>
    {@render children()}
  </Shell>
{/if}
