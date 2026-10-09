<script lang="ts">
  import type { Snippet } from 'svelte';
  import GitBranch from '@lucide/svelte/icons/git-branch';
  import Search from '@lucide/svelte/icons/search';
  import Button from '#lib/components/controls/Button.svelte';
  import Tooltip from '#lib/components/overlays/Tooltip.svelte';
  import CodeSearchForm from '#lib/repositories/search/CodeSearchForm.svelte';
  import BranchPicker from '../BranchPicker.svelte';
  import { treeHref } from '../entry-path';
  import type { BranchSummary } from '../types';
  import type { FileTree } from './file-tree.svelte';
  import FileTreeView from './FileTreeView.svelte';

  let {
    tree,
    branches,
    current,
    onFind,
    action
  }: {
    tree: FileTree;
    branches: BranchSummary[];
    current: string;
    onFind: () => void;
    action: Snippet;
  } = $props();
  const location = $derived(tree.location);
</script>

<div class="flex min-h-0 flex-1 flex-col gap-1.5 p-1.5">
  <div class="grid gap-1.5 rounded-lg bg-surface-muted/60 p-1.5">
    <div class="flex items-center gap-1">
      <BranchPicker
        class="flex-1"
        {branches}
        selected={location.revision}
        href={(branch) => treeHref({ ...location, revision: branch })}
      />
      <Tooltip text="All branches">
        {#snippet children(tooltip)}
          <a
            class="inline-flex h-8 items-center gap-1 rounded-md px-2 text-xs font-medium text-ink-muted tabular-nums transition-colors hover:bg-surface-hover hover:text-ink-strong"
            href="/{location.owner}/{location.repository}/branches"
            aria-label="{branches.length} {branches.length === 1 ? 'branch' : 'branches'}"
            {...tooltip}><GitBranch size={13} />{branches.length}</a
          >
        {/snippet}
      </Tooltip>
      {@render action()}
    </div>
    <div class="flex items-center gap-1">
      <CodeSearchForm
        compact
        class="flex-1"
        owner={location.owner}
        repository={location.repository}
        revision={location.revision}
      />
      <Tooltip text="Go to file (T)" as="label">
        {#snippet children(tooltip)}
          <Button icon size="small" variant="ghost" onclick={onFind} {...tooltip}><Search size={15} /></Button>
        {/snippet}
      </Tooltip>
    </div>
  </div>
  <FileTreeView {tree} {current} />
</div>
