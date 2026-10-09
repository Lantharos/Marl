<script lang="ts">
  import { page } from '$app/state';
  import FolderTree from '@lucide/svelte/icons/folder-tree';
  import GitCommitHorizontal from '@lucide/svelte/icons/git-commit-horizontal';
  import { api } from '#lib/api.js';
  import CommitSignature from '#lib/code/CommitSignature.svelte';
  import LinkButton from '#lib/components/controls/LinkButton.svelte';
  import EmptyState from '#lib/components/feedback/EmptyState.svelte';
  import InfiniteScroll from '#lib/components/feedback/InfiniteScroll.svelte';
  import UserProfileLink from '#lib/components/identity/UserProfileLink.svelte';
  import PageHeader from '#lib/components/page/PageHeader.svelte';
  import Seo from '#lib/components/page/Seo.svelte';
  import Time from '#lib/components/page/Time.svelte';
  import type { CommitSummary } from '#lib/repositories/browser/types.js';
  import { treeHref } from '#lib/repositories/browser/entry-path.js';
  import { timestampGroup } from '#lib/time.js';
  import { CursorList } from '#lib/ui/cursor-list.svelte.js';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
  const owner = $derived(page.params.owner ?? '');
  const repo = $derived(page.params.repo ?? '');
  const revision = $derived(page.params.revision ?? 'main');
  const history = new CursorList(
    () => ({ items: data.history.commits, nextCursor: data.history.nextCursor }),
    async (cursor) => {
      const params = new URLSearchParams({ revision, limit: '50', cursor });
      const result = await api<{ commits: CommitSummary[]; nextCursor: string | null }>(
        `/repositories/${owner}/${repo}/commits?${params}`
      );
      return { items: result.commits, nextCursor: result.nextCursor };
    },
    'More commits could not be loaded.'
  );
  const groups = $derived.by(() => {
    const grouped = new Map<string, CommitSummary[]>();
    for (const commit of history.items) {
      const label = timestampGroup(commit.authoredAt);
      grouped.set(label, [...(grouped.get(label) ?? []), commit]);
    }
    return [...grouped];
  });
</script>

<Seo
  title={`Commits · ${owner}/${repo} · Marl`}
  description={`Browse the commit history for ${revision} in ${owner}/${repo} on Marl.`}
  path={page.url.pathname}
  robots={data.repository.visibility === 'public' ? 'index, follow' : 'noindex, nofollow'}
/>

<PageHeader
  title="Commit history"
  description={`${data.history.total.toLocaleString()} ${data.history.total === 1 ? 'commit' : 'commits'} on ${revision}`}
>
  {#snippet action()}<LinkButton
      size="small"
      href={treeHref({
        owner,
        repository: repo,
        revision,
        defaultBranch: data.repository.defaultBranch
      })}><FolderTree size={14} />Browse files</LinkButton
    >{/snippet}
</PageHeader>

{#if history.items.length}
  <div class="grid gap-7">
    {#each groups as [label, group] (label)}
      <section>
        <h2 class="mb-2.5 flex items-center gap-2 px-1 text-sm font-semibold text-ink-strong">
          <GitCommitHorizontal size={15} class="text-ink-muted" />{label}
        </h2>
        <div class="divide-y divide-line-subtle surface">
          {#each group as commit (commit.id)}
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
                  href="/{owner}/{repo}/commit/{commit.id}">{commit.title}</a
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
                  href="/{owner}/{repo}/commit/{commit.id}">{commit.shortId}</a
                >
              </span>
            </article>
          {/each}
        </div>
      </section>
    {/each}
  </div>
{:else}
  <div class="surface">
    <EmptyState
      icon={GitCommitHorizontal}
      title="No commits yet"
      description="This branch does not contain any commits."
    />
  </div>
{/if}
<InfiniteScroll list={history} />
