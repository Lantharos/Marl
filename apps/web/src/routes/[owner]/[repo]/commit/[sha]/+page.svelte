<script lang="ts">
  import { page } from '$app/stores';
  import ArrowRight from 'lucide-svelte/icons/arrow-right';
  import BadgeCheck from 'lucide-svelte/icons/badge-check';
  import Check from 'lucide-svelte/icons/check';
  import Copy from 'lucide-svelte/icons/copy';
  import GitCommitHorizontal from 'lucide-svelte/icons/git-commit-horizontal';
  import { api } from '$lib/api';
  import DiffViewer from '$lib/components/DiffViewer.svelte';
  import Button from '$lib/components/Button.svelte';
  import Seo from '$lib/components/Seo.svelte';
  import Time from '$lib/components/Time.svelte';
  import UserProfileLink from '$lib/components/UserProfileLink.svelte';
  import { encodeRevision } from '$lib/repository-path';
  import { seoExcerpt } from '$lib/seo';
  import type { CommitDetail } from './+page';
  import type { PageData } from './$types';

  let { data } = $props<{ data: PageData }>();
  const owner = $derived($page.params.owner ?? '');
  const repo = $derived($page.params.repo ?? '');
  const base = $derived(`/${owner}/${repo}`);
  const commit = $derived(data.commit as CommitDetail);
  let copied = $state(false);

  async function copy() {
    await navigator.clipboard.writeText(commit.id);
    copied = true;
    setTimeout(() => (copied = false), 1200);
  }
  async function loadPatch(file: CommitDetail['files'][number]) {
    const result = await api<{ patch: string }>(`/repositories/${owner}/${repo}/commits/${commit.id}/patch?path=${encodeURIComponent(file.path)}`);
    return result.patch;
  }
</script>

<Seo title={`${commit.id.slice(0, 7)} · ${owner}/${repo} · Marl`} description={seoExcerpt(commit.body || commit.title, `View commit ${commit.id.slice(0, 7)} in ${owner}/${repo} on Marl.`)} path={$page.url.pathname} robots={data.repository.visibility === 'public' ? 'index, follow' : 'noindex, nofollow'} />

<header class="commit-head">
  <div class="heading"><GitCommitHorizontal size={20} /><div><h1>{commit.title}</h1>{#if commit.body}<p>{commit.body}</p>{/if}</div></div>
  <div class="meta"><UserProfileLink handle={commit.authorHandle} displayName={commit.authorDisplayName || commit.author} avatarUrl={commit.authorAvatarUrl} size={24} /><span>&lt;{commit.authorEmail}&gt;</span><Time value={commit.authoredAt} />{#if commit.signatureStatus === 'verified'}<i><BadgeCheck size={13} />Verified</i>{/if}</div>
  <div class="identity"><code>{commit.id}</code><Button icon size="small" aria-label="Copy commit hash" onclick={copy}>{#if copied}<Check size={13} />{:else}<Copy size={13} />{/if}</Button></div>
  <div class="parents">{#each commit.parents as parent (parent)}<a href="{base}/commit/{parent}">Parent {parent.slice(0, 7)}</a>{/each}<a href="{base}/tree/{encodeRevision(commit.id)}">Browse files</a></div>
</header>

{#if commit.files.some((file) => file.oldPath)}
  <div class="renames">{#each commit.files.filter((file) => file.oldPath) as file (file.path)}<span><code>{file.oldPath}</code><ArrowRight size={12} /><code>{file.path}</code></span>{/each}</div>
{/if}
{#if commit.files.length}<DiffViewer files={commit.files} reviewable={false} onLoadPatch={loadPatch} />{:else}<div class="empty"><strong>No file changes</strong><p>This commit does not change the tree relative to its first parent.</p></div>{/if}

<style>
  .commit-head{position:relative;padding:5px 0 22px;border-bottom:1px solid var(--border)}.heading{display:flex;align-items:flex-start;gap:9px;color:var(--brand)}.heading h1{max-width:790px;margin:0;color:var(--text-strong);font-size:20px;font-weight:660;letter-spacing:-.025em}.heading p{max-width:760px;margin:8px 0 0;color:var(--text-muted);font-size:11px;line-height:1.55;white-space:pre-wrap}.meta{display:flex;align-items:center;gap:6px;margin-top:14px;color:var(--text-faint);font-size:9px}.meta :global(.user-profile-link){font-size:9px}.meta i{display:flex;align-items:center;gap:3px;color:var(--success);font-style:normal}.identity{position:absolute;top:0;right:0;display:flex;max-width:310px;border:1px solid var(--border);border-radius:6px}.identity code{overflow:hidden;padding:8px;color:var(--text-muted);font-size:8px;text-overflow:ellipsis}.parents{display:flex;gap:12px;margin-top:13px}.parents a{color:var(--brand);font-size:9px;text-decoration:none}.parents a:last-child{margin-left:auto}.renames{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:12px}.renames span{display:flex;align-items:center;gap:6px;color:var(--text-faint);font-size:9px}.renames code{color:var(--text-muted)}.empty{padding:50px 0;border-top:1px solid var(--border-subtle);color:var(--text-faint);text-align:center}.empty strong{color:var(--text-strong);font-size:12px}.empty p{font-size:10px}@media(max-width:760px){.identity{position:static;width:100%;max-width:none;margin-top:14px}.meta{flex-wrap:wrap}.parents a:last-child{margin-left:0}}
</style>
