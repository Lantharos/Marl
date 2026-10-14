<script lang="ts">
  import FileView from '#lib/repositories/browser/file/FileView.svelte';
  import FolderView from '#lib/repositories/browser/FolderView.svelte';
  import EmptyRepository from '#lib/repositories/EmptyRepository.svelte';
  import { codeLocation, workspaceLinks } from '#lib/workspace/code/code-repository.js';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();
  const location = $derived(codeLocation(data.repository));
</script>

<svelte:head><title>{data.repository.owner}/{data.repository.name} · Marl</title></svelte:head>

{#if data.folders && data.selectedFile && data.preview}
  <FileView
    {location}
    path={data.selectedFile}
    preview={data.preview}
    rendered={data.rendered}
    links={workspaceLinks}
    showCommit={false}
  />
{:else if data.folders}
  <FolderView {location} path="" tree={data.folders['']} links={workspaceLinks} />
{:else}
  <EmptyRepository
    name={data.repository.name}
    defaultBranch={data.repository.defaultBranch}
    cloneUrl={data.repository.cloneUrl}
    sshCloneUrl={data.repository.sshCloneUrl}
    canPush={data.repository.permissions.push}
  />
{/if}
