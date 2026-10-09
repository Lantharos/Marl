<script lang="ts">
  import { page } from '$app/state';
  import Seo from '#lib/components/page/Seo.svelte';
  import FolderView from '#lib/repositories/browser/FolderView.svelte';
  import EmptyRepository from '#lib/repositories/EmptyRepository.svelte';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();
  const name = $derived(`${data.repository.owner}/${data.repository.name}`);
</script>

<Seo
  title={`Code · ${name} · Marl`}
  description={`Browse the source, branches, and commit history for ${name} on Marl.`}
  path={page.url.pathname}
  robots={data.repository.visibility === 'public' ? 'index, follow' : 'noindex, nofollow'}
/>

{#if data.folders}
  <FolderView
    location={{
      owner: data.repository.owner,
      repository: data.repository.name,
      revision: data.repository.defaultBranch,
      defaultBranch: data.repository.defaultBranch
    }}
    path=""
    tree={data.folders['']}
    readme={data.readme}
  />
{:else}
  <EmptyRepository
    name={data.repository.name}
    defaultBranch={data.repository.defaultBranch}
    cloneUrl={data.repository.cloneUrl}
    sshCloneUrl={data.repository.sshCloneUrl}
    canPush={data.repository.permissions.push}
  />
{/if}
