<script lang="ts">
  import { page } from '$app/stores';
  import { onDestroy, tick, untrack } from 'svelte';
  import BadgeCheck from 'lucide-svelte/icons/badge-check';
  import Check from 'lucide-svelte/icons/check';
  import ChevronDown from 'lucide-svelte/icons/chevron-down';
  import File from 'lucide-svelte/icons/file';
  import Folder from 'lucide-svelte/icons/folder';
  import GitBranch from 'lucide-svelte/icons/git-branch';
  import History from 'lucide-svelte/icons/history';
  import Search from 'lucide-svelte/icons/search';
  import X from 'lucide-svelte/icons/x';
  import { dismissable } from '$lib/actions/dismissable';
  import { api } from '$lib/api';
  import Button from '$lib/components/Button.svelte';
  import EmptyRepository from '$lib/repositories/EmptyRepository.svelte';
  import Time from '$lib/components/Time.svelte';
  import UserProfileLink from '$lib/components/UserProfileLink.svelte';
  import { encodeRepositoryPath, encodeRevision } from '$lib/repository-path';
  import type { PageData } from './$types';

  type BranchItem = { name: string; commit: string; updatedAt: string };
  type BranchData = { name: string; commitId: string; updatedAt: string };
  type FileItem = { path: string; name: string; kind: 'folder' | 'file'; message: string; updatedAt: string };
  type TreeEntry = { path: string; name: string; kind: 'blob' | 'tree'; message?: string; updatedAt?: string };
  type Commit = { id: string; shortId: string; title: string; author: string; authorHandle?: string | null; authorDisplayName?: string | null; authorAvatarUrl?: string | null; signatureStatus: string };

  let { data } = $props<{ data: PageData }>();
  const owner = $derived($page.params.owner ?? '');
  const repo = $derived($page.params.repo ?? '');
  let selectedBranch = $state(untrack(() => data.defaultBranch));
  let branchItems = $state<BranchItem[]>(untrack(() => data.branches.map((branch: BranchData) => ({ name: branch.name, commit: branch.commitId.slice(0, 7), updatedAt: branch.updatedAt }))));
  let fileItems = $state<FileItem[]>(untrack(() => mapEntries(data.tree?.entries ?? [])));
  let latestCommit = $state<Commit | null>(untrack(() => data.tree?.commit ?? null));
  let branchOpen = $state(false);
  let branchQuery = $state('');
  let finderOpen = $state(false);
  let fileQuery = $state('');
  let finderItems = $state<FileItem[]>([]);
  let finderInput = $state<HTMLInputElement>();
  let searchTimer: ReturnType<typeof setTimeout> | undefined;
  let searchRequest = 0;
  let error = $state(false);
  const revisionPath = $derived(encodeRevision(selectedBranch));
  const matchingBranches = $derived(branchItems.filter((branch) => branch.name.toLowerCase().includes(branchQuery.toLowerCase())));

  function mapEntries(entries: TreeEntry[]) {
    return entries.map((entry) => ({ path: entry.path, name: entry.name, kind: entry.kind === 'tree' ? 'folder' as const : 'file' as const, message: entry.message ?? '', updatedAt: entry.updatedAt ?? '' }));
  }

  async function chooseBranch(branch: string) {
    selectedBranch = branch;
    branchOpen = false;
    error = false;
    try {
      const result = await api<{ commit: Commit; entries: TreeEntry[] }>(`/repositories/${owner}/${repo}/tree?revision=${encodeURIComponent(branch)}`);
      latestCommit = result.commit;
      fileItems = mapEntries(result.entries);
    } catch {
      error = true;
    }
  }

  async function openFinder() {
    fileQuery = '';
    finderItems = fileItems;
    finderOpen = true;
    await tick();
    finderInput?.focus();
  }

  function searchFiles(query: string) {
    fileQuery = query;
    clearTimeout(searchTimer);
    const request = ++searchRequest;
    if (!query.trim()) {
      finderItems = fileItems;
      return;
    }
    searchTimer = setTimeout(async () => {
      try {
        const result = await api<{ entries: TreeEntry[] }>(`/repositories/${owner}/${repo}/tree?revision=${encodeURIComponent(selectedBranch)}&query=${encodeURIComponent(query)}`);
        if (request === searchRequest) finderItems = mapEntries(result.entries);
      } catch {
        if (request === searchRequest) finderItems = [];
      }
    }, 120);
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key !== 'Escape') return;
    branchOpen = false;
    finderOpen = false;
  }

  onDestroy(() => clearTimeout(searchTimer));
</script>

<svelte:window onkeydown={handleKeydown} />
<svelte:head><title>Code · {owner}/{repo} · Marl</title></svelte:head>

<div class="code-page">
  {#if latestCommit}
  <div class="toolbar">
    <div class="branch-group">
      <div class="branch-anchor" use:dismissable={() => (branchOpen = false)}>
        <Button class="branch-button" aria-expanded={branchOpen} onclick={() => (branchOpen = !branchOpen)}><GitBranch size={15} /><span>{selectedBranch}</span><ChevronDown size={13} /></Button>
        {#if branchOpen}<div class="branch-menu"><label><Search size={13} /><input bind:value={branchQuery} placeholder="Find a branch" data-1p-ignore /></label>{#each matchingBranches as branch (branch.name)}<button class:chosen={branch.name === selectedBranch} onclick={() => void chooseBranch(branch.name)}><span><strong>{branch.name}</strong><small>{branch.commit} · <Time value={branch.updatedAt} /></small></span>{#if branch.name === selectedBranch}<Check size={14} />{/if}</button>{:else}<p>No matching branches</p>{/each}</div>{/if}
      </div>
      <a href="/{owner}/{repo}/branches"><GitBranch size={14} /><span>{branchItems.length} {branchItems.length === 1 ? 'branch' : 'branches'}</span></a>
    </div>
    <Button onclick={openFinder}>Go to file</Button>
  </div>

  <section class="browser" aria-label="Repository files">
    <header>
      <UserProfileLink handle={latestCommit.authorHandle} displayName={latestCommit.authorDisplayName || latestCommit.author} avatarUrl={latestCommit.authorAvatarUrl} size={25} />
      <span class="commit-copy"><span>{latestCommit.title}</span></span>
      {#if latestCommit.signatureStatus === 'verified'}<span class="verified"><BadgeCheck size={13} />Verified</span>{/if}
      <a class="commit-id" href="/{owner}/{repo}/commit/{latestCommit.id}">{latestCommit.shortId}</a>
      <a class="history" href="/{owner}/{repo}/commits/{revisionPath}"><History size={14} />History</a>
    </header>
    <div>
      {#each fileItems as item (item.path)}
        <a class="file-row" href="/{owner}/{repo}/{item.kind === 'folder' ? 'tree' : 'blob'}/{revisionPath}/{encodeRepositoryPath(item.path)}">
          <span class="file-name">{#if item.kind === 'folder'}<Folder size={16} fill="currentColor" />{:else}<File size={16} />{/if}<strong>{item.name}</strong></span>
          <span class="file-meta">{#if item.message}<span>{item.message}</span>{/if}{#if item.updatedAt}<Time class="file-time" value={item.updatedAt} />{/if}</span>
        </a>
      {:else}<p class="empty">{error ? 'Repository files could not be loaded.' : 'This branch is empty.'}</p>{/each}
    </div>
  </section>
  {#if error}<p class="error" role="alert">Repository data could not be loaded. Refresh to try again.</p>{/if}
  {:else}
    <EmptyRepository name={repo} defaultBranch={data.defaultBranch} cloneUrl={data.repository.cloneUrl} sshCloneUrl={data.repository.sshCloneUrl} canPush={data.repository.permissions.push} />
  {/if}
</div>

{#if finderOpen}
  <div class="finder-layer" role="presentation" onclick={(event) => event.currentTarget === event.target && (finderOpen = false)}>
    <div class="finder" role="dialog" aria-modal="true" aria-label="Go to file">
      <header><Search size={17} /><input bind:this={finderInput} value={fileQuery} oninput={(event) => searchFiles(event.currentTarget.value)} placeholder="Search files in this repository" data-1p-ignore /><Button icon size="small" aria-label="Close file finder" onclick={() => (finderOpen = false)}><X size={16} /></Button></header>
      <div>{#each finderItems as item (item.path)}<a href="/{owner}/{repo}/{item.kind === 'folder' ? 'tree' : 'blob'}/{revisionPath}/{encodeRepositoryPath(item.path)}"><span>{#if item.kind === 'folder'}<Folder size={15} />{:else}<File size={15} />{/if}{item.path}</span><small>{item.kind}</small></a>{/each}</div>
    </div>
  </div>
{/if}

<style>
  .code-page{width:min(1120px,100%);margin:0 auto}.toolbar{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px}.branch-group{display:flex;align-items:center;gap:7px}.branch-anchor{position:relative}.toolbar :global(.button),.branch-group>a{display:inline-flex;height:34px;align-items:center;gap:6px;padding:0 10px;border:1px solid var(--border);border-radius:7px;background:var(--surface);color:var(--text);font-size:11px;font-weight:590;text-decoration:none;cursor:pointer}.toolbar :global(.button:hover),.branch-group>a:hover{background:var(--surface-muted);color:var(--text-strong)}.branch-group>a{border-color:transparent;background:transparent;color:var(--text-muted)}.toolbar :global(.branch-button.button){min-width:106px;justify-content:flex-start}.toolbar :global(.branch-button.button span){flex:1;text-align:left}.branch-menu{position:absolute;top:40px;left:0;z-index:20;width:290px;padding:6px;border:1px solid var(--border-strong);border-radius:9px;background:var(--surface);box-shadow:var(--shadow-card)}.branch-menu label{display:flex;align-items:center;gap:6px;height:31px;margin-bottom:4px;padding:0 8px;border:1px solid var(--border);border-radius:6px;color:var(--text-faint)}.branch-menu input{min-width:0;flex:1;border:0;outline:0;background:transparent;color:var(--text-strong);font-size:10px}.branch-menu>button{display:flex;width:100%;height:auto;min-height:46px;justify-content:space-between;border:0}.branch-menu>button.chosen{background:var(--brand-soft);color:var(--brand)}.branch-menu strong,.branch-menu small{display:block;text-align:left}.branch-menu strong{color:var(--text-strong);font-size:11px}.branch-menu small{margin-top:3px;color:var(--text-faint);font-size:9px}.branch-menu>p{margin:0;padding:16px 8px;color:var(--text-faint);font-size:10px;text-align:center}.browser{overflow:hidden;border:1px solid var(--border);border-radius:9px;background:var(--surface);box-shadow:var(--shadow-subtle)}.browser>header{display:grid;grid-template-columns:auto minmax(0,1fr) auto auto auto;min-height:48px;align-items:center;gap:9px;padding:7px 11px;border-bottom:1px solid var(--border);background:var(--surface-muted)}.browser>header :global(.user-profile-link){font-size:11px}.commit-copy{display:flex;min-width:0;gap:5px;overflow:hidden;font-size:11px;white-space:nowrap}.commit-copy span{overflow:hidden;color:var(--text-muted);text-overflow:ellipsis}.verified{display:inline-flex;align-items:center;gap:4px;color:var(--success);font-size:10px;font-weight:650}.commit-id{color:var(--text-faint);font-family:"SFMono-Regular",Consolas,monospace;font-size:9px;text-decoration:none}.history{display:inline-flex;align-items:center;gap:4px;color:var(--text-muted);font-size:10px;text-decoration:none}.file-row{display:grid;grid-template-columns:minmax(210px,.72fr) minmax(0,1.28fr);min-height:39px;align-items:center;gap:14px;padding:0 11px;border-top:1px solid var(--border-subtle);color:inherit;text-decoration:none}.file-row:first-child{border-top:0}.file-row:hover{background:var(--surface-hover)}.file-name{display:flex;min-width:0;align-items:center;gap:8px;color:var(--brand)}.file-name strong{overflow:hidden;color:var(--text-strong);font-size:11px;font-weight:570;text-overflow:ellipsis;white-space:nowrap}.file-meta{display:flex;min-width:0;align-items:center;justify-content:flex-end;gap:18px}.file-meta>span{overflow:hidden;color:var(--text-muted);font-size:10px;text-overflow:ellipsis;white-space:nowrap}:global(.file-time){flex:none;color:var(--text-faint);font-size:9px;text-align:right}.empty{margin:0;padding:30px 12px;color:var(--text-faint);font-size:10px;text-align:center}.error{margin:10px 0 0;color:var(--danger);font-size:10px}.finder-layer{position:fixed;z-index:100;inset:0;display:flex;justify-content:center;padding-top:90px;background:rgb(0 0 0/.58);backdrop-filter:blur(3px)}.finder{width:min(620px,calc(100vw - 28px));height:fit-content;max-height:min(560px,calc(100vh - 130px));overflow:hidden;border:1px solid var(--border-strong);border-radius:9px;background:var(--surface);box-shadow:var(--shadow-card)}.finder header{display:flex;align-items:center;gap:9px;padding:11px 12px;border-bottom:1px solid var(--border);color:var(--text-faint)}.finder header input{min-width:0;flex:1;border:0;outline:0;background:transparent;color:var(--text-strong);font-size:13px}.finder>div{overflow-y:auto;max-height:470px;padding:6px}.finder a{display:flex;min-height:38px;align-items:center;justify-content:space-between;padding:0 9px;border-radius:6px;color:var(--text);font-size:11px;text-decoration:none}.finder a:hover{background:var(--brand-soft)}.finder a span{display:flex;align-items:center;gap:7px}.finder a small{color:var(--text-faint);font-size:9px}@media(max-width:680px){.branch-group>a{width:34px;justify-content:center;padding:0}.branch-group>a span{display:none}.browser>header{grid-template-columns:auto minmax(0,1fr) auto auto}.commit-id{display:none}.file-row{grid-template-columns:minmax(0,1fr) auto}.file-meta>span{display:none}}
</style>
