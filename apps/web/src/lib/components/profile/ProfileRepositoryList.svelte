<script lang="ts">
  import type { PublicProfileRepository } from '@marl/contracts';
  import ArrowUpRight from '@lucide/svelte/icons/arrow-up-right';
  import FolderGit2 from '@lucide/svelte/icons/folder-git-2';
  import EmptyState from '../feedback/EmptyState.svelte';
  import Time from '../page/Time.svelte';
  import RepositoryIcon from '../identity/RepositoryIcon.svelte';
  let {
    repositories,
    empty = 'No public repositories yet'
  }: { repositories: PublicProfileRepository[]; empty?: string } = $props();
</script>

<div class="surface p-1.5">
  {#each repositories as repository (repository.id)}
    <a
      href="/{repository.owner}/{repository.name}"
      class="group grid grid-cols-[28px_minmax(0,1fr)_16px] items-start gap-3 rounded-lg px-3 py-4 transition-colors hover:bg-surface-hover"
    >
      <RepositoryIcon name={repository.name} src={repository.iconUrl} size={28} />
      <span class="min-w-0">
        <strong class="block truncate text-base font-semibold text-ink-strong group-hover:text-brand"
          >{repository.name}</strong
        >
        {#if repository.description}<span class="mt-1 block truncate text-sm text-ink-muted"
            >{repository.description}</span
          >{/if}
        <span class="mt-1.5 flex flex-wrap items-center gap-1 text-xs text-ink-muted"
          >{repository.defaultBranch}<span aria-hidden="true">·</span>Updated <Time
            value={repository.updatedAt}
            class="text-xs text-ink-muted"
          /></span
        >
      </span>
      <ArrowUpRight size={15} class="mt-1 text-ink-faint group-hover:text-brand" />
    </a>
  {:else}
    <EmptyState compact icon={FolderGit2} title={empty} />
  {/each}
</div>
