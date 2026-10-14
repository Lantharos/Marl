<script lang="ts">
  import CodeWorkspace from '#lib/workspace/code/CodeWorkspace.svelte';
  import type { LayoutProps } from './$types';

  let { data, children }: LayoutProps = $props();
</script>

{#key data.repository.id}
  <CodeWorkspace
    repository={data.repository}
    branches={data.branches}
    latestRelease={data.latestRelease}
    signedIn={Boolean(data.shellUser)}
  >
    {@render children()}
  </CodeWorkspace>
{/key}
