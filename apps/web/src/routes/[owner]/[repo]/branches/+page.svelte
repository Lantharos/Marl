<script lang="ts">
  import { page } from '$app/stores';
  import GitBranch from 'lucide-svelte/icons/git-branch';
  import Search from 'lucide-svelte/icons/search';
  import Time from '$lib/components/Time.svelte';
  import { encodeRevision } from '$lib/repository-path';
  import type { PageData } from './$types';

  let { data } = $props<{ data: PageData }>();
  const owner = $derived($page.params.owner ?? '');
  const repo = $derived($page.params.repo ?? '');
  const base = $derived(`/${owner}/${repo}`);
  let query = $state('');
  const items = $derived(data.branches as Array<{ name: string; commit: string; title: string; updatedAt: string; isDefault: boolean }>);
  const visible = $derived(items.filter((branch) => branch.name.toLowerCase().includes(query.toLowerCase())));

  function compareHref(branch: string) {
    const repository = `${owner}/${repo}`;
    return `/pulls/new?${new URLSearchParams({ repository, sourceRepository: repository, base: data.defaultBranch, compare: branch })}`;
  }
</script>

<svelte:head><title>Branches · {$page.params.owner}/{$page.params.repo} · Marl</title></svelte:head>
<header><h1>Branches</h1><p>Browse active lines of work and compare them with the default branch.</p></header>
<label class="search"><Search size={14} /><input bind:value={query} placeholder="Find a branch" /></label>
<section class="list">
  {#each visible as branch (branch.name)}
    <div class="row"><span class="icon"><GitBranch size={16} /></span><span class="main"><a href="{base}/tree/{encodeRevision(branch.name)}">{branch.name}</a><small><code>{branch.commit}</code> {branch.title} · <Time value={branch.updatedAt} /></small></span>{#if branch.isDefault}<span class="default">Default</span>{:else}<a class="compare" href={compareHref(branch.name)}>Compare</a>{/if}</div>
  {/each}
</section>

<style>
  header{margin-bottom:20px}h1{margin:0;color:var(--text-strong);font-size:22px;letter-spacing:-.025em}header p{margin:6px 0 0;color:var(--text-muted);font-size:12px}.search{display:flex;width:min(340px,100%);height:34px;align-items:center;gap:7px;margin-bottom:11px;padding:0 9px;border:1px solid var(--border);border-radius:7px;background:var(--surface);color:var(--text-faint)}input{flex:1;border:0;outline:0;background:transparent;color:var(--text-strong);font-size:11px}.list{overflow:hidden;border:1px solid var(--border);border-radius:9px;background:var(--surface)}.row{display:grid;grid-template-columns:32px minmax(0,1fr) auto;align-items:center;gap:11px;min-height:70px;padding:11px 14px;border-top:1px solid var(--border-subtle)}.row:first-child{border:0}.icon{display:grid;width:30px;height:30px;place-items:center;border-radius:7px;background:var(--brand-soft);color:var(--brand)}.main{min-width:0}.main a{color:var(--text-strong);font-size:12px;font-weight:650;text-decoration:none}.main a:hover{color:var(--brand)}.main small{display:block;overflow:hidden;margin-top:5px;color:var(--text-faint);font-size:9px;text-overflow:ellipsis;white-space:nowrap}code{color:var(--text-muted)}.default{padding:4px 7px;border-radius:99px;background:var(--surface-muted);color:var(--text-muted);font-size:9px;font-weight:620}.compare{padding:5px 8px;border:1px solid var(--border);border-radius:6px;color:var(--text-muted);font-size:9px;font-weight:620;text-decoration:none}
</style>
