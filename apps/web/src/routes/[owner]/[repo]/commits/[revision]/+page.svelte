<script lang="ts">
  import { page } from '$app/stores';
  import BadgeCheck from 'lucide-svelte/icons/badge-check';
  import GitCommitHorizontal from 'lucide-svelte/icons/git-commit-horizontal';
  import { api } from '$lib/api';
  import Button from '$lib/components/Button.svelte';
  import LinkButton from '$lib/components/LinkButton.svelte';
  import Seo from '$lib/components/Seo.svelte';
  import Time from '$lib/components/Time.svelte';
  import UserProfileLink from '$lib/components/UserProfileLink.svelte';
  import { encodeRevision } from '$lib/repository-path';
  import { timestampGroup } from '$lib/time';
  import type { CommitSummary } from './+page';
  import type { PageData } from './$types';

  let { data } = $props<{ data: PageData }>();
  const base = $derived(`/${$page.params.owner}/${$page.params.repo}`);
  const revision = $derived($page.params.revision ?? 'main');
  let loadedCommits = $state<CommitSummary[]>();
  let loadedCursor = $state<string | null>();
  const commits = $derived(loadedCommits ?? data.history.commits);
  const nextCursor = $derived(loadedCursor === undefined ? data.history.nextCursor : loadedCursor);
  let loading = $state(false);
  let loadFailed = $state(false);
  const groups = $derived.by(() => {
    const grouped = new Map<string, CommitSummary[]>();
    for (const commit of commits) {
      const label = timestampGroup(commit.authoredAt);
      grouped.set(label, [...(grouped.get(label) ?? []), commit]);
    }
    return [...grouped];
  });

  async function loadMore() {
    if (!nextCursor || loading) return;
    loading = true;
    loadFailed = false;
    try {
      const result = await api<{ commits: CommitSummary[]; nextCursor: string | null }>(`/repositories/${$page.params.owner}/${$page.params.repo}/commits?revision=${encodeURIComponent(revision)}&limit=50&cursor=${encodeURIComponent(nextCursor)}`);
      loadedCommits = [...commits, ...result.commits];
      loadedCursor = result.nextCursor;
    } catch {
      loadFailed = true;
    } finally {
      loading = false;
    }
  }

  function loadIfNearEnd() {
    if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 600) void loadMore();
  }
</script>

<Seo title={`Commits · ${$page.params.owner}/${$page.params.repo} · Marl`} description={`Browse the commit history for ${revision} in ${$page.params.owner}/${$page.params.repo} on Marl.`} path={$page.url.pathname} robots={data.repository.visibility === 'public' ? 'index, follow' : 'noindex, nofollow'} />
<svelte:window onscroll={loadIfNearEnd} />

<header class="page-head">
  <div><h1>Commit history</h1><p><strong>{data.history.total}</strong> {data.history.total === 1 ? 'commit' : 'commits'} on <code>{revision}</code></p></div>
  <LinkButton size="small" href="{base}/tree/{encodeRevision(revision)}">Browse files</LinkButton>
</header>

<div class="history">
  {#each groups as [label, commits] (label)}
    <section>
      <h2>{label}</h2>
      <div class="commit-list">
        {#each commits as commit (commit.id)}
          <article>
            <span class="mark"><GitCommitHorizontal size={15} /></span>
            <UserProfileLink handle={commit.authorHandle} displayName={commit.authorDisplayName || commit.author} avatarUrl={commit.authorAvatarUrl} size={28} name={false} />
            <div class="commit-copy">
              <a href="{base}/commit/{commit.id}">{commit.title}</a>
              <p><UserProfileLink handle={commit.authorHandle} displayName={commit.authorDisplayName || commit.author} avatar={false} /> committed <Time value={commit.authoredAt} /></p>
            </div>
            {#if commit.signatureStatus === 'verified'}<span class="verified"><BadgeCheck size={13} />Verified</span>{/if}
            <a class="sha" href="{base}/commit/{commit.id}">{commit.shortId}</a>
          </article>
        {/each}
      </div>
    </section>
  {:else}
    <div class="empty"><GitCommitHorizontal size={20} /><strong>No commits yet</strong><p>This branch does not contain any commits.</p></div>
  {/each}
</div>
<div class="load-target">{#if loading}<span aria-label="Loading more commits"></span>{:else if loadFailed}<Button size="small" onclick={loadMore}>Try again</Button>{/if}</div>

<style>
  .page-head{display:flex;align-items:flex-end;justify-content:space-between;margin-bottom:26px}.page-head h1{margin:0;color:var(--text-strong);font-size:22px;letter-spacing:-.025em}.page-head p{margin:6px 0 0;color:var(--text-muted);font-size:11px}.page-head p strong,.page-head code{color:var(--text-strong)}.history{display:grid;gap:25px}.history section{display:grid;grid-template-columns:105px minmax(0,1fr);align-items:start}.history h2{position:sticky;top:82px;margin:12px 0 0;color:var(--text-muted);font-size:11px;font-weight:600}.commit-list{padding:4px;border-radius:12px;background:var(--surface)}article{display:grid;grid-template-columns:22px 30px minmax(0,1fr) auto auto;align-items:center;gap:10px;min-height:66px;padding:12px;border-radius:8px}article:hover{background:var(--surface-hover)}.mark{display:grid;color:var(--text-faint)}.commit-copy{min-width:0}.commit-copy>a{display:block;overflow:hidden;color:var(--text-strong);font-size:13px;font-weight:640;text-decoration:none;text-overflow:ellipsis;white-space:nowrap}.commit-copy>a:hover{color:var(--brand)}.commit-copy p{display:flex;flex-wrap:wrap;align-items:center;gap:3px;margin:4px 0 0;color:var(--text-faint);font-size:11px}.commit-copy p :global(.user-profile-link){color:var(--text-muted)}.verified{display:flex;align-items:center;gap:4px;color:var(--success);font-size:11px}.sha{padding:8px;border-radius:6px;color:var(--text-muted);font:11px var(--font-mono);text-decoration:none}.sha:hover{background:var(--surface-hover);color:var(--text-strong)}.empty{display:grid;min-height:220px;place-content:center;justify-items:center;color:var(--text-faint);text-align:center}.empty strong{margin-top:9px;color:var(--text-strong);font-size:12px}.empty p{margin:5px 0;font-size:11px}@media(max-width:700px){.history section{grid-template-columns:1fr}.history h2{position:static;margin:0 0 8px}.verified{display:none}article{grid-template-columns:20px 28px minmax(0,1fr) auto}}@media(max-width:480px){.page-head{align-items:flex-start}.page-head p strong{display:none}.mark{display:none}article{grid-template-columns:28px minmax(0,1fr) auto}.sha{font-size:0}.sha::after{font-size:11px;content:'View'}}
  .load-target{display:grid;min-height:48px;place-items:center}.load-target span{width:15px;height:15px;border:2px solid var(--border-strong);border-top-color:var(--brand);border-radius:50%;animation:spin .7s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}
</style>
