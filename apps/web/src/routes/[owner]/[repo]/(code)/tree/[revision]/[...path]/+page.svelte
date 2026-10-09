<script lang="ts">
  import { page } from '$app/state';
  import Seo from '#lib/components/page/Seo.svelte';
  import FolderView from '#lib/repositories/browser/FolderView.svelte';
  import type { PageProps } from './$types';

  let { data, params }: PageProps = $props();
  const name = $derived(`${data.repository.owner}/${data.repository.name}`);
</script>

<Seo
  title={`${params.path || params.revision} · ${name} · Marl`}
  description={`Browse ${params.path || 'the repository root'} at ${params.revision} in ${name} on Marl.`}
  path={page.url.pathname}
  robots={data.repository.visibility === 'public' ? 'index, follow' : 'noindex, nofollow'}
/>
<FolderView
  location={{
    owner: data.repository.owner,
    repository: data.repository.name,
    revision: params.revision,
    defaultBranch: data.repository.defaultBranch
  }}
  path={params.path}
  tree={data.folders[params.path]}
  readme={data.readme}
/>
