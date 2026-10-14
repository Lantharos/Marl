<script lang="ts">
  import FolderView from '#lib/repositories/browser/FolderView.svelte';
  import { codeLocation, workspaceLinks } from '#lib/workspace/code/code-repository.js';
  import type { PageProps } from './$types';

  let { data, params }: PageProps = $props();
</script>

<svelte:head
  ><title>{params.path || params.revision} · {data.repository.owner}/{data.repository.name} · Marl</title></svelte:head
>

<FolderView
  location={codeLocation(data.repository, params.revision)}
  path={params.path}
  tree={data.folders[params.path]}
  links={workspaceLinks}
/>
