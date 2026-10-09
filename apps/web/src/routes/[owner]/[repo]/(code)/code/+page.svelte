<script lang="ts">
  import { page } from '$app/state';
  import Seo from '#lib/components/page/Seo.svelte';
  import FileView from '#lib/repositories/browser/file/FileView.svelte';
  import FolderView from '#lib/repositories/browser/FolderView.svelte';
  import EmptyRepository from '#lib/repositories/EmptyRepository.svelte';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();
  const name = $derived(`${data.repository.owner}/${data.repository.name}`);
  const location = $derived({
    owner: data.repository.owner,
    repository: data.repository.name,
    revision: data.repository.defaultBranch,
    defaultBranch: data.repository.defaultBranch
  });
</script>

<Seo
  title={`Code · ${name} · Marl`}
  description={`Browse the source, branches, and commit history for ${name} on Marl.`}
  path={page.url.pathname}
  robots={data.repository.visibility === 'public' ? 'index, follow' : 'noindex, nofollow'}
/>

{#if data.folders && data.selectedFile && data.preview}
  <FileView
    {location}
    path={data.selectedFile}
    preview={data.preview}
    rendered={data.rendered}
    entry={data.folders[''].entries.find((item) => item.path === data.selectedFile)}
  />
{:else if data.folders}
  <FolderView {location} path="" tree={data.folders['']} />
{:else}
  <EmptyRepository
    name={data.repository.name}
    defaultBranch={data.repository.defaultBranch}
    cloneUrl={data.repository.cloneUrl}
    sshCloneUrl={data.repository.sshCloneUrl}
    canPush={data.repository.permissions.push}
  />
{/if}
