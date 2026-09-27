<script lang="ts">
  import { page } from '$app/state';
  import { onDestroy } from 'svelte';
  import ArrowRight from '@lucide/svelte/icons/arrow-right';
  import CommitSignature from '$lib/code/CommitSignature.svelte';
  import Check from '@lucide/svelte/icons/check';
  import Copy from '@lucide/svelte/icons/copy';
  import FolderTree from '@lucide/svelte/icons/folder-tree';
  import GitCommitHorizontal from '@lucide/svelte/icons/git-commit-horizontal';
  import { api } from '$lib/api';
  import DiffViewer from '$lib/code/DiffViewer.svelte';
  import Button from '$lib/components/controls/Button.svelte';
  import LinkButton from '$lib/components/controls/LinkButton.svelte';
  import EmptyState from '$lib/components/feedback/EmptyState.svelte';
  import Seo from '$lib/components/page/Seo.svelte';
  import Time from '$lib/components/page/Time.svelte';
  import UserProfileLink from '$lib/components/identity/UserProfileLink.svelte';
  import { encodeRevision } from '$lib/repositories/repository-path';
  import { seoExcerpt } from '$lib/seo';
  import type { CommitDetail } from './+page';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
  const owner = $derived(page.params.owner ?? '');
  const repo = $derived(page.params.repo ?? '');
  const base = $derived(`/${owner}/${repo}`);
  const commit = $derived(data.commit);
  const renames = $derived(commit.files.filter((file) => file.oldPath));
  let copied = $state(false);
  let copiedTimer: ReturnType<typeof setTimeout> | undefined;

  async function copy() {
    await navigator.clipboard.writeText(commit.id);
    copied = true;
    clearTimeout(copiedTimer);
    copiedTimer = setTimeout(() => (copied = false), 1200);
  }
  onDestroy(() => clearTimeout(copiedTimer));
  async function loadPatch(file: CommitDetail['files'][number]) {
    const result = await api<{ patch: string }>(
      `/repositories/${owner}/${repo}/commits/${commit.id}/patch?path=${encodeURIComponent(file.path)}`
    );
    return result.patch;
  }
</script>

<Seo
  title={`${commit.id.slice(0, 7)} · ${owner}/${repo} · Marl`}
  description={seoExcerpt(
    commit.body || commit.title,
    `View commit ${commit.id.slice(0, 7)} in ${owner}/${repo} on Marl.`
  )}
  path={page.url.pathname}
  robots={data.repository.visibility === 'public' ? 'index, follow' : 'noindex, nofollow'}
/>

<header class="mb-7 grid gap-4">
  <div class="flex flex-wrap items-start justify-between gap-4">
    <div class="min-w-0 flex-[1_1_320px]">
      <h1 class="text-xl font-semibold tracking-tight wrap-anywhere text-ink-strong sm:text-2xl">{commit.title}</h1>
      {#if commit.body}<p class="mt-3 max-w-[80ch] text-sm leading-relaxed whitespace-pre-wrap text-ink">
          {commit.body}
        </p>{/if}
    </div>
    <LinkButton size="small" href="{base}/tree/{encodeRevision(commit.id)}"
      ><FolderTree size={14} />Browse files</LinkButton
    >
  </div>
  <div class="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-ink-muted">
    <span class="inline-flex min-w-0 items-center gap-1.5"
      ><UserProfileLink
        handle={commit.authorHandle}
        displayName={commit.authorDisplayName || commit.author}
        avatarUrl={commit.authorAvatarUrl}
        size={22}
      />
      committed <Time value={commit.authoredAt} class="text-ink-muted" /></span
    >
    <CommitSignature status={commit.signatureStatus} />
    <span class="inline-flex items-center gap-1 rounded-lg bg-surface-muted py-0.5 pr-0.5 pl-2.5">
      <code class="font-mono text-xs text-ink">{commit.id.slice(0, 12)}</code>
      <Button icon size="small" variant="ghost" class="size-7" aria-label="Copy commit hash" onclick={copy}
        >{#if copied}<Check size={13} class="text-success" />{:else}<Copy size={13} />{/if}</Button
      >
    </span>
    {#each commit.parents as parent (parent)}<a
        class="inline-flex items-center gap-1 font-mono text-xs hover:text-brand"
        href="{base}/commit/{parent}"><GitCommitHorizontal size={13} />{parent.slice(0, 7)}</a
      >{/each}
  </div>
</header>

{#if renames.length}
  <div class="mb-4 grid gap-1 text-xs text-ink-muted">
    {#each renames as file (file.path)}<span class="flex min-w-0 items-center gap-1.5"
        ><code class="truncate font-mono">{file.oldPath}</code><ArrowRight size={12} class="shrink-0" /><code
          class="truncate font-mono text-ink">{file.path}</code
        ></span
      >{/each}
  </div>
{/if}
{#if commit.files.length}<DiffViewer
    files={commit.files}
    comparison={{
      old: commit.parents[0] ? { owner, repository: repo, revision: commit.parents[0] } : undefined,
      new: { owner, repository: repo, revision: commit.id }
    }}
    reviewable={false}
    onLoadPatch={loadPatch}
  />{:else}<div class="surface">
    <EmptyState
      icon={GitCommitHorizontal}
      title="No file changes"
      description="This commit does not change the tree relative to its first parent."
    />
  </div>{/if}
