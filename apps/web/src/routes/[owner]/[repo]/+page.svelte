<script lang="ts">
  import { page } from '$app/stores';
  import { tick, untrack } from 'svelte';
  import { onDestroy } from 'svelte';
  import BookOpen from 'lucide-svelte/icons/book-open';
  import Check from 'lucide-svelte/icons/check';
  import ChevronDown from 'lucide-svelte/icons/chevron-down';
  import File from 'lucide-svelte/icons/file';
  import FileText from 'lucide-svelte/icons/file-text';
  import Folder from 'lucide-svelte/icons/folder';
  import GitBranch from 'lucide-svelte/icons/git-branch';
  import History from 'lucide-svelte/icons/history';
  import Search from 'lucide-svelte/icons/search';
  import X from 'lucide-svelte/icons/x';
  import { api, apiText } from '$lib/api';
  import MarkdownPreview from '$lib/components/MarkdownPreview.svelte';
  import Time from '$lib/components/Time.svelte';
  import UserAvatar from '$lib/components/UserAvatar.svelte';
  import { dismissable } from '$lib/actions/dismissable';
  import { encodeRepositoryPath, encodeRevision } from '$lib/repository-path';
  import type { RepositoryDocument } from './+page';
  import type { PageData } from './$types';

  type BranchItem = { name: string; commit: string; title: string; updatedAt: string; isDefault: boolean; ahead: number; behind: number };
  type FileItem = { path: string; name: string; kind: 'folder' | 'file'; size?: string; message: string; updatedAt: string };
  type CommitItem = { id: string; shortId: string; title: string; author: string; authorAvatarUrl?: string | null; authoredAt: string; verified: boolean };
  type BranchData = { name: string; commitId: string; title: string; updatedAt: string };
  type TreeEntryData = { path: string; name: string; kind: 'blob' | 'tree'; byteSize?: number; message?: string; updatedAt?: string };
  const documentPatterns = [[/^readme(?:\.(?:md|markdown|txt))?$/i, 'README'], [/^(?:license|copying)(?:\.(?:md|markdown|txt))?$/i, 'License'], [/^contributing(?:\.(?:md|markdown|txt))?$/i, 'Contributing'], [/^code[_-]of[_-]conduct(?:\.(?:md|markdown|txt))?$/i, 'Code of conduct'], [/^security(?:\.(?:md|markdown|txt))?$/i, 'Security'], [/^support(?:\.(?:md|markdown|txt))?$/i, 'Support']] as const;

  let { data } = $props<{ data: PageData }>();
  const owner = $derived($page.params.owner ?? 'lantharos');
  const repo = $derived($page.params.repo ?? 'sty');
  let branchOpen = $state(false);
  let fileFinderOpen = $state(false);
  let selectedBranch = $state(untrack(() => data.defaultBranch));
  let branchQuery = $state('');
  let fileQuery = $state('');
  let finderInput = $state<HTMLInputElement>();
  let branchItems = $state<BranchItem[]>(untrack(() => data.branches.map((branch: BranchData) => ({ name: branch.name, commit: branch.commitId.slice(0, 7), title: branch.title, updatedAt: branch.updatedAt, isDefault: branch.name === data.defaultBranch, ahead: 0, behind: 0 }))));
  let fileItems = $state<FileItem[]>(untrack(() => data.tree.entries.map((entry: TreeEntryData) => ({ path: entry.path, name: entry.name, kind: entry.kind === 'tree' ? 'folder' as const : 'file' as const, size: entry.byteSize ? `${entry.byteSize} B` : undefined, message: entry.message ?? '', updatedAt: entry.updatedAt ?? '' }))));
  let finderItems = $state<FileItem[]>([]);
  let fileSearchTimer: ReturnType<typeof setTimeout> | undefined;
  let fileSearchRequest = 0;
  let latestCommit = $state<CommitItem | null>(untrack(() => ({ ...data.tree.commit, verified: data.tree.commit.signatureStatus === 'verified' })));
  let documents = $state<RepositoryDocument[]>(untrack(() => [...data.documents]));
  let activeDocument = $state<RepositoryDocument | null>(untrack(() => data.activeDocument));
  let documentContent = $state(untrack(() => data.documentContent));
  let documentCache = $state<Record<string, string>>(untrack(() => data.activeDocument ? { [data.activeDocument.path]: data.documentContent } : {}));
  let liveError = $state(false);
  const revisionPath = $derived(encodeRevision(selectedBranch));
  const matchingBranches = $derived(branchItems.filter((branch) => branch.name.toLowerCase().includes(branchQuery.toLowerCase())));

  function documentsFrom(entries: TreeEntryData[]) {
    return documentPatterns.flatMap(([pattern, label]) => {
      const entry = entries.find((candidate) => candidate.kind === 'blob' && pattern.test(candidate.name));
      return entry ? [{ path: entry.path, label }] : [];
    });
  }

  async function selectDocument(document: RepositoryDocument) {
    activeDocument = document;
    if (documentCache[document.path] !== undefined) { documentContent = documentCache[document.path]; return; }
    try {
      const content = await apiText(`/repositories/${owner}/${repo}/blob/${encodeURIComponent(selectedBranch)}/${encodeRepositoryPath(document.path)}`);
      documentCache = { ...documentCache, [document.path]: content };
      documentContent = content;
    } catch { documentContent = ''; liveError = true; }
  }

  async function openFileFinder() {
    fileQuery = '';
    finderItems = fileItems;
    fileFinderOpen = true;
    await tick();
    finderInput?.focus();
  }

  function searchFiles(query: string) {
    fileQuery = query;
    clearTimeout(fileSearchTimer);
    const request = ++fileSearchRequest;
    if (!query.trim()) {
      finderItems = fileItems;
      return;
    }
    fileSearchTimer = setTimeout(async () => {
      try {
        const result = await api<{ entries: TreeEntryData[] }>(`/repositories/${owner}/${repo}/tree?revision=${encodeURIComponent(selectedBranch)}&query=${encodeURIComponent(query)}`);
        if (request !== fileSearchRequest) return;
        finderItems = result.entries.map((entry) => ({ path: entry.path, name: entry.name, kind: entry.kind === 'tree' ? 'folder' : 'file', size: entry.byteSize ? `${entry.byteSize} B` : undefined, message: entry.message ?? '', updatedAt: entry.updatedAt ?? '' }));
      } catch {
        if (request === fileSearchRequest) finderItems = [];
      }
    }, 120);
  }

  async function loadTree(branch: string) {
    const result = await api<{ commit: { id: string; shortId: string; title: string; author: string; authorAvatarUrl?: string | null; authoredAt: string; signatureStatus: string }; entries: TreeEntryData[] }>(`/repositories/${owner}/${repo}/tree?revision=${encodeURIComponent(branch)}`);
    latestCommit = { ...result.commit, verified: result.commit.signatureStatus === 'verified' };
    fileItems = result.entries.map((entry) => ({ path: entry.path, name: entry.name, kind: entry.kind === 'tree' ? 'folder' : 'file', size: entry.byteSize ? `${entry.byteSize} B` : undefined, message: entry.message ?? '', updatedAt: entry.updatedAt ?? '' }));
    documents = documentsFrom(result.entries);
    activeDocument = documents[0] ?? null;
    documentCache = {};
    documentContent = '';
    if (activeDocument) await selectDocument(activeDocument);
  }

  async function chooseBranch(name: string) {
    selectedBranch = name; branchOpen = false;
    try { await loadTree(name); } catch { liveError = true; }
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key !== 'Escape') return;
    branchOpen = false;
    fileFinderOpen = false;
  }

  onDestroy(() => clearTimeout(fileSearchTimer));
</script>

<svelte:window onkeydown={handleKeydown} />

<svelte:head>
  <title>{owner}/{repo} · Sty</title>
</svelte:head>

<div class="code-toolbar">
  <div class="branch-group">
    <div class="popover-anchor" use:dismissable={() => (branchOpen = false)}>
      <button class="branch-button" aria-expanded={branchOpen} onclick={() => (branchOpen = !branchOpen)}><GitBranch size={15} /><span>{selectedBranch}</span><ChevronDown size={13} /></button>
      {#if branchOpen}<div class="branch-menu"><label><Search size={13} /><input bind:value={branchQuery} placeholder="Find a branch" /></label>{#each matchingBranches as branch}<button class:chosen={branch.name === selectedBranch} onclick={() => void chooseBranch(branch.name)}><span><strong>{branch.name}</strong><small>{branch.commit} · <Time value={branch.updatedAt} /></small></span>{#if branch.name === selectedBranch}<Check size={14} />{/if}</button>{:else}<p class="no-branches">No matching branches</p>{/each}</div>{/if}
    </div>
    <a href="/{owner}/{repo}/branches"><GitBranch size={14} /><span>{branchItems.length} branches</span></a>
  </div>
  <div class="code-actions">
    <button onclick={openFileFinder}>Go to file</button>
  </div>
</div>

<div class="code-layout">
  <div class="code-main">
    <section class="file-browser" aria-label="Repository files">
      {#if latestCommit}<header class="latest-commit">
        <UserAvatar name={latestCommit.author} src={latestCommit.authorAvatarUrl} size={25} />
          <span class="commit-copy"><strong>{latestCommit.author}</strong><span>{latestCommit.title}</span></span>
          <a class="commit-id" href="/{owner}/{repo}/commit/{latestCommit.id}">{latestCommit.shortId}</a>
        <a class="history" href="/{owner}/{repo}/commits/{revisionPath}"><History size={14} />History</a>
      </header>{/if}

      <div class="file-list">
        {#each fileItems as item}
          <a class="file-row" href="/{owner}/{repo}/{item.kind === 'folder' ? 'tree' : 'blob'}/{revisionPath}/{encodeRepositoryPath(item.name)}">
            <span class="file-name">
              {#if item.kind === 'folder'}<Folder size={16} fill="currentColor" />{:else}<File size={16} />{/if}
              <strong>{item.name}</strong>
            </span>
            <span class="file-meta">{#if item.message}<span class="file-message">{item.message}</span>{/if}{#if item.updatedAt}<Time class="file-time" value={item.updatedAt} />{/if}</span>
          </a>
        {:else}<div class="empty-tree">{liveError ? 'Repository files could not be loaded.' : 'This branch is empty.'}</div>{/each}
      </div>
    </section>

    <article class="readme">
      <header><div class="document-tabs">{#each documents as document}<button class:active={activeDocument?.path === document.path} onclick={() => void selectDocument(document)}><BookOpen size={14} />{document.label}</button>{/each}</div>{#if activeDocument}<a href="/{owner}/{repo}/blob/{revisionPath}/{encodeRepositoryPath(activeDocument.path)}"><FileText size={14} />View file</a>{/if}</header>
      <div class="readme-content">
        {#if activeDocument && documentContent}<MarkdownPreview source={documentContent} />{:else}<p class="no-readme">This repository does not have a README, license, or community document on {selectedBranch}.</p>{/if}
      </div>
    </article>
  </div>

</div>
{#if liveError}<div class="live-notice" role="alert">Repository data could not be loaded. Refresh to try again.</div>{/if}

{#if fileFinderOpen}
  <div class="finder-layer" role="presentation" onclick={(event) => event.currentTarget === event.target && (fileFinderOpen = false)}>
    <div class="file-finder" role="dialog" aria-modal="true" aria-label="Go to file">
      <header><Search size={17} /><input bind:this={finderInput} value={fileQuery} oninput={(event) => searchFiles(event.currentTarget.value)} placeholder="Search files in this repository" /><button aria-label="Close file finder" onclick={() => (fileFinderOpen = false)}><X size={16} /></button></header>
      <div>{#each finderItems as item}<a href="/{owner}/{repo}/{item.kind === 'folder' ? 'tree' : 'blob'}/{revisionPath}/{encodeRepositoryPath(item.path)}"><span>{#if item.kind === 'folder'}<Folder size={15} />{:else}<File size={15} />{/if}{item.path}</span><small>{item.kind}</small></a>{/each}</div>
    </div>
  </div>
{/if}

<style>
  .code-toolbar { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
  .branch-group, .code-actions { display: flex; align-items: center; gap: 7px; }
  .popover-anchor { position: relative; }
  button, .branch-group a { display: inline-flex; height: 34px; align-items: center; gap: 6px; border: 1px solid var(--border); border-radius: 7px; background: var(--surface); color: var(--text); font-size: 11px; font-weight: 590; text-decoration: none; cursor: pointer; }
  button { padding: 0 10px; }
  .branch-group a { padding: 0 9px; border-color: transparent; background: transparent; color: var(--text-muted); }
  button:hover, .branch-group a:hover { background: var(--surface-muted); color: var(--text-strong); }
  .branch-button { min-width: 106px; justify-content: flex-start; }
  .branch-button span { flex: 1; text-align: left; }
  .branch-menu { position: absolute; top: 40px; z-index: 20; width: 290px; padding: 6px; border: 1px solid var(--border-strong); border-radius: 9px; background: var(--surface); box-shadow: var(--shadow-card); }
  .branch-menu { left: 0; } .branch-menu label { display: flex; align-items: center; gap: 6px; height: 31px; margin-bottom: 4px; padding: 0 8px; border: 1px solid var(--border); border-radius: 6px; color: var(--text-faint); } .branch-menu input { min-width: 0; flex: 1; border: 0; outline: 0; background: transparent; color: var(--text-strong); font-size: 10px; } .branch-menu > button { display: flex; width: 100%; height: auto; min-height: 46px; align-items: center; justify-content: space-between; border: 0; } .branch-menu > button.chosen { background: var(--brand-soft); color: var(--brand); } .branch-menu strong, .branch-menu small { display: block; text-align: left; } .branch-menu strong { color: var(--text-strong); font-size: 11px; } .branch-menu small { margin-top: 3px; color: var(--text-faint); font-size: 9px; }
  .no-branches { margin: 0; padding: 16px 8px; color: var(--text-faint); font-size: 10px; text-align: center; }
  .code-layout { display: block; }
  .code-main { min-width: 0; }
  .file-browser, .readme { overflow: hidden; border: 1px solid var(--border); border-radius: 9px; background: var(--surface); box-shadow: var(--shadow-subtle); }
  .latest-commit { display: grid; grid-template-columns: 27px minmax(0, 1fr) auto auto; min-height: 48px; align-items: center; gap: 9px; padding: 7px 11px; border-bottom: 1px solid var(--border); background: var(--surface-muted); }
  .commit-avatar { display: grid; width: 25px; height: 25px; place-items: center; border-radius: 50%; background: #d5b496; color: #3d2518; font-size: 9px; font-weight: 740; }
  .commit-copy { display: flex; min-width: 0; gap: 5px; overflow: hidden; font-size: 11px; white-space: nowrap; }
  .commit-copy strong { color: var(--text-strong); font-weight: 630; }
  .commit-copy span { overflow: hidden; color: var(--text-muted); text-overflow: ellipsis; }
  .commit-id { color: var(--text-faint); font-family: "SFMono-Regular", Consolas, monospace; font-size: 9px; text-decoration: none; }
  .history { display: inline-flex; align-items: center; gap: 4px; color: var(--text-muted); font-size: 10px; text-decoration: none; }
  .file-row { display: grid; grid-template-columns: minmax(160px, .7fr) minmax(0, 1.3fr); min-height: 39px; align-items: center; gap: 14px; padding: 0 11px; border-top: 1px solid var(--border-subtle); color: inherit; text-decoration: none; }
  .file-row:first-child { border-top: 0; }
  .file-row:hover { background: var(--surface-hover); }
  .file-name { display: flex; min-width: 0; align-items: center; gap: 8px; color: var(--brand); }
  .file-name strong { overflow: hidden; color: var(--text-strong); font-size: 11px; font-weight: 570; text-overflow: ellipsis; white-space: nowrap; }
  .file-meta { display: flex; min-width: 0; align-items: center; justify-content: flex-end; gap: 18px; }
  .file-message { overflow: hidden; color: var(--text-muted); font-size: 10px; text-overflow: ellipsis; white-space: nowrap; }
  :global(.file-time) { flex: none; color: var(--text-faint); font-size: 9px; text-align: right; }
  .empty-tree { padding: 30px 12px; color: var(--text-faint); font-size: 10px; text-align: center; }
  .readme { margin-top: 18px; }
  .readme > header { display: flex; min-height: 43px; align-items: center; justify-content: space-between; padding: 0 11px 0 14px; border-bottom: 1px solid var(--border); background: var(--surface-muted); }
  .document-tabs{display:flex;align-self:stretch;gap:2px}.document-tabs button{position:relative;height:auto;padding:0 8px;border:0;border-radius:0;background:transparent;color:var(--text-muted);font-size:10px}.document-tabs button.active{color:var(--text-strong)}.document-tabs button.active::after{position:absolute;inset:auto 7px -1px;height:2px;background:var(--brand);content:''}
  .readme > header a { display: inline-flex; align-items: center; gap: 5px; color: var(--text-muted); font-size: 9px; text-decoration: none; }
  .readme > header a:hover { color: var(--brand); }
  .readme-content { padding: 26px 30px 34px; }
  .no-readme { margin: 0; color: var(--text-faint); font-size: 11px; }
  .live-notice { position: fixed; right: 20px; bottom: 20px; z-index: 30; padding: 9px 11px; border: 1px solid var(--warning); border-radius: 7px; background: var(--warning-soft); color: var(--warning); font-size: 10px; box-shadow: var(--shadow-card); }
  .finder-layer { position: fixed; z-index: 100; inset: 0; display: flex; justify-content: center; padding-top: 90px; background: rgb(0 0 0 / .58); backdrop-filter: blur(3px); } .file-finder { width: min(620px, calc(100vw - 28px)); height: fit-content; max-height: min(560px, calc(100vh - 130px)); overflow: hidden; border: 1px solid var(--border-strong); border-radius: 9px; background: var(--surface); box-shadow: var(--shadow-card); } .file-finder header { display: flex; align-items: center; gap: 9px; padding: 11px 12px; border-bottom: 1px solid var(--border); color: var(--text-faint); } .file-finder header input { min-width: 0; flex: 1; border: 0; outline: 0; background: transparent; color: var(--text-strong); font-size: 13px; } .file-finder header button { width: 28px; height: 28px; padding: 0; border: 0; } .file-finder > div { overflow-y: auto; max-height: 470px; padding: 6px; } .file-finder a { display: flex; min-height: 38px; align-items: center; justify-content: space-between; padding: 0 9px; border-radius: 6px; color: var(--text); font-size: 11px; text-decoration: none; } .file-finder a:hover { background: var(--brand-soft); } .file-finder a span { display: flex; align-items: center; gap: 7px; } .file-finder a small { color: var(--text-faint); font-size: 9px; }

  @media (max-width: 1080px) {
    .code-layout { grid-template-columns: 1fr; }
  }

  @media (max-width: 680px) {
    .branch-group a { width: 34px; justify-content: center; padding: 0; }
    .branch-group a span { display: none; }
    .latest-commit { grid-template-columns: 27px minmax(0, 1fr) auto; }
    .commit-id { display: none; }
    .file-row { grid-template-columns: minmax(0, 1fr) auto; }
    .file-message { display: none; }
    .readme-content { padding: 22px 19px 28px; }
  }
</style>
