<script lang="ts">
  import GitCommitHorizontal from '@lucide/svelte/icons/git-commit-horizontal';

  let {
    commits,
    repository
  }: { commits: Array<{ id: string; title: string }>; repository: { owner: string; name: string } } = $props();

  const visibleLimit = 4;
  let expanded = $state(false);
  const newestFirst = $derived(commits.toReversed());
  const visible = $derived(
    expanded || newestFirst.length <= visibleLimit + 1 ? newestFirst : newestFirst.slice(0, visibleLimit)
  );
</script>

<ol class="grid" aria-label="Commits in this revision">
  {#each visible as commit (commit.id)}
    <li>
      <a
        href="/{repository.owner}/{repository.name}/commit/{encodeURIComponent(commit.id)}"
        class="group grid grid-cols-[14px_auto_minmax(0,1fr)] items-center gap-2.5 rounded-lg px-2 py-1 text-sm transition-colors hover:bg-surface-hover"
      >
        <GitCommitHorizontal size={14} class="text-ink-faint" aria-hidden="true" />
        <code class="font-mono text-xs text-ink-muted group-hover:text-brand">{commit.id.slice(0, 7)}</code>
        <span class="truncate text-ink">{commit.title}</span>
      </a>
    </li>
  {/each}
  {#if visible.length < newestFirst.length}
    <li class="px-2 py-0.5">
      <button
        type="button"
        class="pl-6 text-xs font-semibold text-ink-muted hover:text-brand"
        onclick={() => (expanded = true)}>{newestFirst.length - visible.length} earlier commits</button
      >
    </li>
  {/if}
</ol>
