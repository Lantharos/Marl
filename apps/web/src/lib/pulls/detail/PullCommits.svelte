<script lang="ts">
  import type { PullRequestDetail } from '@marl/contracts';
  import GitCommitHorizontal from '@lucide/svelte/icons/git-commit-horizontal';
  import CommitSignature from '$lib/code/CommitSignature.svelte';
  import EmptyState from '$lib/components/feedback/EmptyState.svelte';
  import UserProfileLink from '$lib/components/identity/UserProfileLink.svelte';
  import Time from '$lib/components/page/Time.svelte';

  let { commits, repository }: { commits: PullRequestDetail['commits']; repository: string } = $props();
</script>

<section class="divide-y divide-line-subtle surface" aria-label="Commits">
  {#each commits as commit (commit.id)}
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
  {:else}
    <EmptyState
      compact
      icon={GitCommitHorizontal}
      title="No commits to merge"
      description="The target branch already contains this pull head."
    />
  {/each}
</section>
