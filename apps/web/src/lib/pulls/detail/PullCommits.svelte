<script lang="ts">
  import type { PullRequestDetail, PullRevisionSummary } from '@marl/contracts';
  import GitCommitHorizontal from '@lucide/svelte/icons/git-commit-horizontal';
  import CommitSignature from '#lib/code/CommitSignature.svelte';
  import EmptyState from '#lib/components/feedback/EmptyState.svelte';
  import UserProfileLink from '#lib/components/identity/UserProfileLink.svelte';
  import Time from '#lib/components/page/Time.svelte';

  type Commit = PullRequestDetail['commits'][number];
  type Group = {
    revision: PullRevisionSummary | null;
    commits: Commit[];
    replaced: Array<{ id: string; title: string }>;
  };

  let { commits, revisions, repository }: { commits: Commit[]; revisions: PullRevisionSummary[]; repository: string } =
    $props();

  const groups = $derived.by<Group[]>(() => {
    const byId = new Map(commits.map((commit) => [commit.id, commit]));
    const placed = new Set<string>();
    const grouped = revisions.toReversed().map((revision) => {
      const group: Group = { revision, commits: [], replaced: [] };
      for (const { id, title } of revision.commits) {
        const commit = byId.get(id);
        if (commit && !placed.has(id)) group.commits.push(commit);
        else if (!commit) group.replaced.push({ id, title });
        placed.add(id);
      }
      return group;
    });
    const unplaced = commits.filter((commit) => !placed.has(commit.id));
    return [...(unplaced.length ? [{ revision: null, commits: unplaced, replaced: [] }] : []), ...grouped].filter(
      (group) => group.commits.length || group.replaced.length
    );
  });
</script>

{#snippet commitRow(commit: Commit)}
  <article class="grid grid-cols-[28px_minmax(0,1fr)_auto] items-center gap-3 px-4 py-3">
    <UserProfileLink
      handle={commit.authorHandle}
      displayName={commit.authorDisplayName || commit.author}
      avatarUrl={commit.authorAvatarUrl}
      size={28}
      name={false}
    />
    <div class="min-w-0">
      <a
        class="block truncate text-sm font-semibold text-ink-strong hover:text-brand"
        href="/{repository}/commit/{commit.id}">{commit.title}</a
      >
      <p class="mt-0.5 flex flex-wrap items-center gap-x-1 text-xs text-ink-muted">
        <UserProfileLink
          handle={commit.authorHandle}
          displayName={commit.authorDisplayName || commit.author}
          avatar={false}
          class="text-xs font-medium"
        />
        committed <Time value={commit.authoredAt} class="text-ink-muted" />
      </p>
    </div>
    <span class="flex items-center gap-3">
      <CommitSignature status={commit.signatureStatus} />
      <a
        class="rounded-md bg-surface-muted px-2 py-1 font-mono text-xs text-ink hover:text-brand"
        href="/{repository}/commit/{commit.id}">{commit.shortId}</a
      >
    </span>
  </article>
{/snippet}

<section class="grid gap-3" aria-label="Commits">
  {#each groups as group (group.revision?.sequence ?? 'unplaced')}
    <section class="rounded-2xl bg-surface-muted/60 p-2 sm:p-2.5">
      {#if group.revision}
        <header class="flex flex-wrap items-baseline gap-x-2 px-2 pt-1 pb-2.5">
          <h2 class="text-sm font-semibold text-ink-strong">Revision {group.revision.number}</h2>
          {#if group.revision.current}<span class="text-xs font-medium text-brand">Current</span>{/if}
          <span class="text-xs text-ink-muted"
            >{group.revision.actorDisplayName || group.revision.actor} pushed <Time
              value={group.revision.createdAt}
            /></span
          >
        </header>
      {/if}
      <div class="divide-y divide-line-subtle surface">
        {#each group.commits as commit (commit.id)}{@render commitRow(commit)}{/each}
        {#each group.replaced as commit (commit.id)}
          <article class="grid grid-cols-[28px_minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 text-ink-muted">
            <GitCommitHorizontal size={16} class="justify-self-center text-ink-faint" aria-hidden="true" />
            <div class="min-w-0">
              <p class="truncate text-sm">{commit.title}</p>
              <p class="mt-0.5 text-xs text-ink-faint">Replaced by a later push</p>
            </div>
            <code class="px-2 font-mono text-xs text-ink-faint">{commit.id.slice(0, 7)}</code>
          </article>
        {/each}
      </div>
    </section>
  {:else}
    <div class="surface">
      <EmptyState
        compact
        icon={GitCommitHorizontal}
        title="No commits to merge"
        description="The target branch already contains this pull head."
      />
    </div>
  {/each}
</section>
