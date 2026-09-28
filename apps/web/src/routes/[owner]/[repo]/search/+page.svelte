<script lang="ts">
  import { goto } from '$app/navigation';
  import { navigating, page } from '$app/state';
  import SearchX from '@lucide/svelte/icons/search-x';
  import TextSearch from '@lucide/svelte/icons/text-search';
  import EmptyState from '$lib/components/feedback/EmptyState.svelte';
  import Notice from '$lib/components/feedback/Notice.svelte';
  import Seo from '$lib/components/page/Seo.svelte';
  import BranchPicker from '$lib/repositories/browser/BranchPicker.svelte';
  import CodeSearchForm from '$lib/repositories/search/CodeSearchForm.svelte';
  import DefinitionList from '$lib/repositories/search/DefinitionList.svelte';
  import SearchedFile from '$lib/repositories/search/SearchedFile.svelte';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
  const owner = $derived(page.params.owner ?? '');
  const repo = $derived(page.params.repo ?? '');
  const loading = $derived(navigating.to?.url.pathname === page.url.pathname);
  const lines = $derived(data.result?.files.reduce((total, file) => total + file.matchCount, 0) ?? 0);

  function chooseRevision(revision: string) {
    const search = new URLSearchParams(page.url.searchParams);
    search.set('ref', revision);
    void goto(`?${search}`, { keepFocus: true, noScroll: true });
  }
</script>

<Seo
  title={`${data.query.q ? `${data.query.q} · ` : ''}Search · ${owner}/${repo} · Marl`}
  description={`Search the code in ${owner}/${repo}.`}
  path={page.url.pathname}
  robots="noindex, nofollow"
/>

<div class="mb-4 flex flex-wrap items-center gap-2">
  <BranchPicker branches={data.branches} selected={data.query.ref} onSelect={chooseRevision} />
  <CodeSearchForm
    class="min-w-64 flex-1"
    {owner}
    repository={repo}
    revision={data.query.ref}
    query={data.query.q}
    regex={data.query.regex}
    caseSensitive={data.query.caseSensitive}
  />
</div>

<div class={['transition-opacity', loading && 'opacity-60']} aria-busy={loading}>
  {#if data.error}
    <Notice>{data.error}</Notice>
  {:else if !data.query.q.trim()}
    <div class="surface">
      <EmptyState
        icon={TextSearch}
        title="Search this repository"
        description="Find text across every file on a branch. Narrow it down with path:src, lang:rust, or ext:toml, and wrap a pattern in slashes to use a regular expression."
      />
    </div>
  {:else if data.result && data.result.files.length}
    {#if data.result.definitions.length}
      <DefinitionList definitions={data.result.definitions} {owner} repository={repo} revision={data.result.commitId} />
    {/if}
    <p class="mb-3 text-sm text-ink-muted">
      {#if data.result.truncated}Showing the first {data.result.files.length} files. Add path: or lang: to narrow the search.
      {:else}{lines.toLocaleString()} matching {lines === 1 ? 'line' : 'lines'} in {data.result.files.length}
        {data.result.files.length === 1 ? 'file' : 'files'}.
      {/if}
    </p>
    <div class="grid gap-3">
      {#each data.result.files as file (file.path)}
        <SearchedFile {file} {owner} repository={repo} revision={data.result.commitId} />
      {/each}
    </div>
  {:else}
    <div class="surface">
      <EmptyState
        icon={SearchX}
        title="No matches"
        description={`Nothing on ${data.query.ref} matches this search. Check the spelling, or turn off Match case.`}
      />
    </div>
  {/if}
</div>
