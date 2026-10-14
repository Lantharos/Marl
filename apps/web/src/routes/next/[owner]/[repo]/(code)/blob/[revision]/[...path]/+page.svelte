<script lang="ts">
  import FileView from '#lib/repositories/browser/file/FileView.svelte';
  import { codeLocation, workspaceLinks } from '#lib/workspace/code/code-repository.js';
  import type { PageProps } from './$types';

  let { data, params }: PageProps = $props();
</script>

<svelte:head><title>{params.path} · {data.repository.owner}/{data.repository.name} · Marl</title></svelte:head>

<FileView
  location={codeLocation(data.repository, params.revision)}
  path={params.path}
  preview={data.preview}
  rendered={data.rendered}
  links={workspaceLinks}
  showCommit={false}
/>
