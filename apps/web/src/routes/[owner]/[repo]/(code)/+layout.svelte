<script lang="ts">
  import Kbd from '#lib/components/page/Kbd.svelte';
  import { page } from '$app/state';
  import GitBranch from '@lucide/svelte/icons/git-branch';
  import Search from '@lucide/svelte/icons/search';
  import Button from '#lib/components/controls/Button.svelte';
  import BranchPicker from '#lib/repositories/browser/BranchPicker.svelte';
  import { treeHref } from '#lib/repositories/browser/entry-path.js';
  import FileFinder from '#lib/repositories/browser/FileFinder.svelte';
  import CodeSearchForm from '#lib/repositories/search/CodeSearchForm.svelte';
  import { plainKey } from '#lib/ui/keyboard.js';
  import type { LayoutProps } from './$types';

  let { data, params, children }: LayoutProps = $props();
  const location = $derived({
    owner: data.repository.owner,
    repository: data.repository.name,
    revision: params.revision ?? data.repository.defaultBranch,
    defaultBranch: data.repository.defaultBranch
  });
  let finderOpen = $state(false);

  function openFinderShortcut(event: KeyboardEvent) {
    if (!data.branches.length || plainKey(event) !== 't' || finderOpen) return;
    event.preventDefault();
    finderOpen = true;
  }
</script>

<svelte:window onkeydown={openFinderShortcut} />

{#if data.branches.length}
  <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
    <div class="flex items-center gap-3">
      <BranchPicker
        branches={data.branches}
        selected={location.revision}
        href={(branch) => treeHref({ ...location, revision: branch })}
      />
      <a
        class="inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-brand"
        href="/{location.owner}/{location.repository}/branches"
        ><GitBranch size={14} /><span class="tabular-nums">{data.branches.length}</span>
        {data.branches.length === 1 ? 'branch' : 'branches'}</a
      >
    </div>
    <div class="flex w-full items-center gap-2 sm:w-auto">
      <CodeSearchForm
        compact
        class="flex-1"
        owner={location.owner}
        repository={location.repository}
        revision={location.revision}
      />
      <Button size="small" onclick={() => (finderOpen = true)}
        ><Search size={14} />Go to file<Kbd class="ml-1 max-sm:hidden">T</Kbd></Button
      >
    </div>
  </div>
{/if}

{@render children()}

{#if finderOpen}<FileFinder
    {location}
    initial={page.data.tree?.entries ?? []}
    onClose={() => (finderOpen = false)}
  />{/if}
