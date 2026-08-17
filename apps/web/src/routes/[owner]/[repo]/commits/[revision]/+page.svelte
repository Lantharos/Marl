<script lang="ts">
  import { page } from '$app/stores';
  import BadgeCheck from 'lucide-svelte/icons/badge-check';
  import GitCommitHorizontal from 'lucide-svelte/icons/git-commit-horizontal';
  import { api } from '$lib/api';
  import Time from '$lib/components/Time.svelte';
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

  function initials(author: string) {
    return author.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase();
  }

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

<svelte:head><title>Commits · {$page.params.owner}/{$page.params.repo} · Sty</title></svelte:head>
<svelte:window onscroll={loadIfNearEnd} />

<header class="page-head">
  <div><h1>Commit history</h1><p><strong>{data.history.total}</strong> {data.history.total === 1 ? 'commit' : 'commits'} on <code>{revision}</code></p></div>
  <a href="{base}/tree/{encodeRevision(revision)}">Browse files</a>
</header>

<div class="history">
  {#each groups as [label, commits]}
    <section>
      <h2>{label}</h2>
      <div class="commit-list">
        {#each commits as commit (commit.id)}
          <article>
            <span class="mark"><GitCommitHorizontal size={15} /></span>
            <span class="avatar">{initials(commit.author)}</span>
            <div class="commit-copy">
              <a href="{base}/commit/{commit.id}">{commit.title}</a>
              <p><strong>{commit.author}</strong> committed <Time value={commit.authoredAt} /></p>
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
<div class="load-target">{#if loading}<span aria-label="Loading more commits"></span>{:else if loadFailed}<button onclick={loadMore}>Try again</button>{/if}</div>

<style>
  .page-head{display:flex;align-items:flex-end;justify-content:space-between;margin-bottom:26px}.page-head h1{margin:0;color:var(--text-strong);font-size:22px;letter-spacing:-.025em}.page-head p{margin:6px 0 0;color:var(--text-muted);font-size:10px}.page-head p strong,.page-head code{color:var(--text-strong)}.page-head>a{padding:7px 10px;border:1px solid var(--border);border-radius:6px;color:var(--text);font-size:10px;font-weight:600;text-decoration:none}.page-head>a:hover{background:var(--surface-hover);color:var(--text-strong)}.history{display:grid;gap:25px}.history section{display:grid;grid-template-columns:105px minmax(0,1fr);align-items:start}.history h2{position:sticky;top:82px;margin:12px 0 0;color:var(--text-muted);font-size:10px;font-weight:600}.commit-list{border-block:1px solid var(--border)}article{display:grid;grid-template-columns:22px 30px minmax(0,1fr) auto auto;align-items:center;gap:10px;min-height:66px;padding:9px 10px;border-top:1px solid var(--border-subtle)}article:first-child{border-top:0}.mark{display:grid;color:var(--text-faint)}.avatar{display:grid;width:28px;height:28px;place-items:center;border-radius:50%;background:#d5b496;color:#3d2518;font-size:9px;font-weight:740}.commit-copy{min-width:0}.commit-copy>a{display:block;overflow:hidden;color:var(--text-strong);font-size:11px;font-weight:640;text-decoration:none;text-overflow:ellipsis;white-space:nowrap}.commit-copy>a:hover{color:var(--brand)}.commit-copy p{margin:4px 0 0;color:var(--text-faint);font-size:9px}.commit-copy p strong{color:var(--text-muted)}.verified{display:flex;align-items:center;gap:4px;color:var(--success);font-size:9px}.sha{padding:5px 7px;border:1px solid var(--border);border-radius:5px;color:var(--text-muted);font:9px ui-monospace,SFMono-Regular,Consolas,monospace;text-decoration:none}.sha:hover{background:var(--surface-hover);color:var(--text-strong)}.empty{display:grid;min-height:220px;place-content:center;justify-items:center;color:var(--text-faint);text-align:center}.empty strong{margin-top:9px;color:var(--text-strong);font-size:12px}.empty p{margin:5px 0;font-size:10px}@media(max-width:700px){.history section{grid-template-columns:1fr}.history h2{position:static;margin:0 0 8px}.verified{display:none}article{grid-template-columns:20px 28px minmax(0,1fr) auto}}@media(max-width:480px){.page-head{align-items:flex-start}.page-head p strong{display:none}.mark{display:none}article{grid-template-columns:28px minmax(0,1fr) auto}.sha{font-size:0}.sha::after{font-size:9px;content:'View'}}
  .load-target{display:grid;min-height:48px;place-items:center}.load-target span{width:15px;height:15px;border:2px solid var(--border-strong);border-top-color:var(--brand);border-radius:50%;animation:spin .7s linear infinite}.load-target button{padding:6px 9px;border:1px solid var(--border);border-radius:5px;background:var(--surface);color:var(--text-muted);cursor:pointer;font-size:9px}@keyframes spin{to{transform:rotate(360deg)}}
</style>
