<script lang="ts">
  import GitCommit from '@lucide/svelte/icons/git-commit-horizontal';
  import EmptyState from '../feedback/EmptyState.svelte';
  import Time from '../page/Time.svelte';
  import UserProfileLink from '../identity/UserProfileLink.svelte';
  type Activity = {
    id: string;
    title: string;
    authoredAt: string;
    owner?: string;
    repository: string;
    author?: string | null;
    authorDisplayName?: string | null;
  };
  let { activity, owner = '' }: { activity: Activity[]; owner?: string } = $props();
</script>

<div class="surface p-1.5">
  {#each activity as item (`${item.owner || owner}/${item.repository}:${item.id}`)}
    <article
      class="relative grid min-h-17 grid-cols-[28px_minmax(0,1fr)_auto] items-center gap-3 rounded-lg p-3 transition-colors hover:bg-surface-hover"
    >
      <span class="grid size-7 place-items-center rounded-full bg-surface-muted text-ink-muted"
        ><GitCommit size={14} /></span
      >
      <span class="min-w-0">
        <a
          class="block truncate text-sm font-semibold text-ink-strong after:absolute after:inset-0"
          href="/{item.owner || owner}/{item.repository}/commit/{item.id}">{item.title}</a
        >
        <span class="mt-1 flex flex-wrap items-center gap-1 text-xs text-ink-muted">
          {#if item.author}<UserProfileLink
              handle={item.author}
              displayName={item.authorDisplayName || item.author}
              avatar={false}
              class="relative z-1 text-xs text-ink"
            /><span aria-hidden="true">·</span>{/if}
          <span>{item.owner ? `${item.owner}/` : ''}{item.repository}</span><span aria-hidden="true">·</span>
          <Time value={item.authoredAt} class="text-xs text-ink-muted" />
        </span>
      </span>
      <code class="font-mono text-xs text-ink-faint">{item.id.slice(0, 7)}</code>
    </article>
  {:else}
    <EmptyState compact icon={GitCommit} title="No public activity yet" />
  {/each}
</div>
