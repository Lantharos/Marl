<script lang="ts">
  import { page } from '$app/state';
  import Seo from '#lib/components/page/Seo.svelte';
  import { parentFolder } from '#lib/repositories/browser/content-cache.svelte.js';
  import FileView from '#lib/repositories/browser/file/FileView.svelte';
  import type { PageProps } from './$types';

  let { data, params }: PageProps = $props();
  const name = $derived(`${data.repository.owner}/${data.repository.name}`);
  const entry = $derived(data.folders[parentFolder(params.path)]?.entries.find((item) => item.path === params.path));
</script>

<Seo
  title={`${params.path} · ${name} · Marl`}
  description={`View ${params.path} at ${params.revision} in ${name} on Marl.`}
  path={page.url.pathname}
  robots={data.repository.visibility === 'public' ? 'index, follow' : 'noindex, nofollow'}
/>
<FileView
  location={{
    owner: data.repository.owner,
    repository: data.repository.name,
    revision: params.revision,
    defaultBranch: data.repository.defaultBranch
  }}
  path={params.path}
  preview={data.preview}
  rendered={data.rendered}
  {entry}
/>
