<script lang="ts">
  import { page } from '$app/state';
  import { untrack } from 'svelte';
  import GitBranch from '@lucide/svelte/icons/git-branch';
  import History from '@lucide/svelte/icons/rotate-ccw-clock';
  import Search from '@lucide/svelte/icons/search';
  import { api } from '$lib/api';
  import CommitSignature from '$lib/code/CommitSignature.svelte';
  import Button from '$lib/components/controls/Button.svelte';
  import Notice from '$lib/components/feedback/Notice.svelte';
  import UserProfileLink from '$lib/components/identity/UserProfileLink.svelte';
  import Seo from '$lib/components/page/Seo.svelte';
  import BranchPicker from '$lib/repositories/browser/BranchPicker.svelte';
  import FileFinder from '$lib/repositories/browser/FileFinder.svelte';
  import FileList from '$lib/repositories/browser/FileList.svelte';
  import type { LatestCommit, TreeEntry } from '$lib/repositories/browser/types';
  import EmptyRepository from '$lib/repositories/EmptyRepository.svelte';
  import { encodeRevision } from '$lib/repositories/repository-path';
  import { plainKey } from '$lib/ui/keyboard';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
  const owner = $derived(page.params.owner ?? '');
  const repo = $derived(page.params.repo ?? '');
  let selectedBranch = $state(untrack(() => data.defaultBranch));
  let entries = $state<TreeEntry[]>(untrack(() => data.tree?.entries ?? []));
  let latestCommit = $state<LatestCommit | null>(untrack(() => data.tree?.commit ?? null));
  let finderOpen = $state(false);
  let error = $state(false);
  let request = 0;

  async function chooseBranch(branch: string) {
    selectedBranch = branch;
    error = false;
    const current = ++request;
    try {
      const result = await api<{ commit: LatestCommit; entries: TreeEntry[] }>(
        `/repositories/${owner}/${repo}/tree?revision=${encodeURIComponent(branch)}`
      );
      if (current !== request) return;
      latestCommit = result.commit;
      entries = result.entries;
    } catch {
      if (current === request) error = true;
    }
  }

  function openFinderShortcut(event: KeyboardEvent) {
    if (plainKey(event) !== 't' || finderOpen) return;
    event.preventDefault();
    finderOpen = true;
  }
</script>

<svelte:window onkeydown={openFinderShortcut} />
<Seo
  title={`Code · ${owner}/${repo} · Marl`}
  description={`Browse the source, branches, and commit history for ${owner}/${repo} on Marl.`}
  path={page.url.pathname}
  robots={data.repository.visibility === 'public' ? 'index, follow' : 'noindex, nofollow'}
/>

{#if latestCommit}
  <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
    <div class="flex items-center gap-3">
      <BranchPicker
        branches={data.branches}
        selected={selectedBranch}
        onSelect={(branch) => void chooseBranch(branch)}
      />
      <a
        class="inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-brand"
        href="/{owner}/{repo}/branches"
        ><GitBranch size={14} /><span class="tabular-nums">{data.branches.length}</span>
        {data.branches.length === 1 ? 'branch' : 'branches'}</a
      >
    </div>
    <Button size="small" onclick={() => (finderOpen = true)}
      ><Search size={14} />Go to file<kbd
        class="ml-1 rounded bg-surface-muted px-1.5 font-sans text-2xs text-ink-muted max-sm:hidden">T</kbd
      ></Button
    >
  </div>

  {#if error}<Notice class="mb-4">Files for this branch could not be loaded. Try again in a moment.</Notice>{/if}
  <FileList {owner} repository={repo} revision={selectedBranch} {entries} empty="This branch is empty.">
    {#snippet header()}
      {#if latestCommit}
        <UserProfileLink
          handle={latestCommit.authorHandle}
          displayName={latestCommit.authorDisplayName || latestCommit.author}
          avatarUrl={latestCommit.authorAvatarUrl}
          size={22}
          class="text-sm font-semibold"
        />
        <a
          class="min-w-0 flex-1 truncate text-sm text-ink-muted hover:text-brand"
          href="/{owner}/{repo}/commit/{latestCommit.id}">{latestCommit.title}</a
        >
        <span class="flex items-center gap-3">
          <CommitSignature status={latestCommit.signatureStatus} />
          <a class="font-mono text-xs text-ink-muted hover:text-brand" href="/{owner}/{repo}/commit/{latestCommit.id}"
            >{latestCommit.shortId}</a
          >
          <a
            class="inline-flex items-center gap-1.5 text-sm font-medium text-ink hover:text-brand"
            href="/{owner}/{repo}/commits/{encodeRevision(selectedBranch)}"><History size={14} />History</a
          >
        </span>
      {/if}
    {/snippet}
  </FileList>
{:else}
  <EmptyRepository
    name={repo}
    defaultBranch={data.defaultBranch}
    cloneUrl={data.repository.cloneUrl}
    sshCloneUrl={data.repository.sshCloneUrl}
    canPush={data.repository.permissions.push}
  />
{/if}

{#if finderOpen}<FileFinder
    {owner}
    repository={repo}
    revision={selectedBranch}
    initial={entries}
    onClose={() => (finderOpen = false)}
  />{/if}
