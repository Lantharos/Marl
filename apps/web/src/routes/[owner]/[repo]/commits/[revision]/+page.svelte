<script lang="ts">
  import { page } from '$app/stores';
  import { onMount } from 'svelte';
  import BadgeCheck from 'lucide-svelte/icons/badge-check';
  import GitCommitHorizontal from 'lucide-svelte/icons/git-commit-horizontal';
  import { api } from '$lib/api';
  const base = $derived(`/${$page.params.owner}/${$page.params.repo}`);
  let items = $state<Array<{id:string;shortId:string;title:string;author:string;authoredAt:string;verified:boolean}>>([]);
  let loadError = $state(false);
  onMount(async () => {
    try {
      const result = await api<{ commits: Array<{ id:string;shortId:string;title:string;author:string;authoredAt:string;signatureStatus:string }> }>(`/repositories/${$page.params.owner}/${$page.params.repo}/commits?limit=100`);
      items = result.commits.map((commit) => ({ ...commit, verified: commit.signatureStatus === 'verified' }));
    } catch { loadError = true; }
  });
</script>
<svelte:head><title>Commits · {$page.params.owner}/{$page.params.repo} · Sty</title></svelte:head>
<header><div><h1>Commits</h1><p>History for <code>{$page.params.revision}</code></p></div><a href="{base}/tree/{$page.params.revision}">Browse files</a></header>
<section class="timeline">
  <h2>Today</h2>
  {#each items as commit}
    <article><span class="node"><GitCommitHorizontal size={16} /></span><span class="avatar">KI</span><div class="main"><a href="{base}/commit/{commit.shortId}">{commit.title}</a><p><strong>{commit.author}</strong> committed {commit.authoredAt}</p></div>{#if commit.verified}<span class="verified"><BadgeCheck size={13} />Verified</span>{/if}<a class="sha" href="{base}/commit/{commit.shortId}">{commit.shortId}</a></article>
  {/each}
</section>
{#if loadError}<p class="error" role="alert">Commit history could not be loaded. Refresh to try again.</p>{/if}
<style>
  header { display: flex; align-items: flex-end; justify-content: space-between; margin-bottom: 25px; } h1 { margin: 0; color: var(--text-strong); font-size: 22px; } header p { margin: 6px 0 0; color: var(--text-muted); font-size: 11px; } header code { color: var(--text-strong); } header > a { padding: 7px 10px; border: 1px solid var(--border); border-radius: 6px; color: var(--text); font-size: 10px; font-weight: 600; text-decoration: none; } .timeline { position: relative; } h2 { margin: 0 0 9px 44px; color: var(--text-muted); font-size: 11px; font-weight: 650; } article { position: relative; display: grid; grid-template-columns: 30px minmax(0,1fr) auto auto; align-items: center; gap: 10px; min-height: 67px; margin-left: 44px; padding: 10px 13px; border: 1px solid var(--border); border-bottom: 0; background: var(--surface); } article:last-child { border-bottom: 1px solid var(--border); border-radius: 0 0 8px 8px; } article:first-of-type { border-radius: 8px 8px 0 0; } .node { position: absolute; left: -34px; display: grid; width: 22px; height: 22px; place-items: center; border: 1px solid var(--border); border-radius: 50%; background: var(--canvas); color: var(--text-faint); } article::before { position: absolute; top: -24px; bottom: -24px; left: -24px; z-index: -1; width: 1px; background: var(--border); content: ''; } .avatar { display: grid; width: 28px; height: 28px; place-items: center; border-radius: 50%; background: #d5b496; color: #3d2518; font-size: 9px; font-weight: 740; } .main { min-width: 0; } .main > a { display: block; overflow: hidden; color: var(--text-strong); font-size: 11px; font-weight: 630; text-decoration: none; text-overflow: ellipsis; white-space: nowrap; } .main p { margin: 4px 0 0; color: var(--text-faint); font-size: 9px; } .verified { display: flex; align-items: center; gap: 3px; color: var(--success); font-size: 9px; } .sha { padding: 5px 7px; border: 1px solid var(--border); border-radius: 5px; color: var(--text-muted); font-family: monospace; font-size: 9px; text-decoration: none; }
  @media(max-width:600px){article{margin-left:30px;grid-template-columns:28px minmax(0,1fr) auto}.node{left:-27px}.verified{display:none}article::before{left:-17px}}
  .error{margin-left:44px;color:var(--danger);font-size:10px}
</style>
