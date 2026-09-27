<script lang="ts">
  import { page } from '$app/state';
  import Seo from '$lib/components/page/Seo.svelte';
  import FileList from '$lib/repositories/browser/FileList.svelte';
  import PathCrumbs from '$lib/repositories/browser/PathCrumbs.svelte';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
  const owner = $derived(page.params.owner ?? '');
  const repo = $derived(page.params.repo ?? '');
  const revision = $derived(page.params.revision ?? 'main');
  const current = $derived(page.params.path ?? '');
</script>

<Seo
  title={`${current || revision} · ${owner}/${repo} · Marl`}
  description={`Browse ${current || 'the repository root'} at ${revision} in ${owner}/${repo} on Marl.`}
  path={page.url.pathname}
  robots={data.repository.visibility === 'public' ? 'index, follow' : 'noindex, nofollow'}
/>
<PathCrumbs {owner} repository={repo} {revision} path={current} />
<FileList
  {owner}
  repository={repo}
  {revision}
  entries={data.entries}
  parentPath={current ? current.split('/').slice(0, -1).join('/') : undefined}
/>
