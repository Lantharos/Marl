<script lang="ts">
  import { page } from '$app/stores';
  import { tick } from 'svelte';
  import { onMount } from 'svelte';
  import BookOpen from 'lucide-svelte/icons/book-open';
  import Check from 'lucide-svelte/icons/check';
  import ChevronDown from 'lucide-svelte/icons/chevron-down';
  import Code2 from 'lucide-svelte/icons/code-2';
  import Copy from 'lucide-svelte/icons/copy';
  import File from 'lucide-svelte/icons/file';
  import Folder from 'lucide-svelte/icons/folder';
  import GitBranch from 'lucide-svelte/icons/git-branch';
  import History from 'lucide-svelte/icons/history';
  import MoreHorizontal from 'lucide-svelte/icons/more-horizontal';
  import Search from 'lucide-svelte/icons/search';
  import X from 'lucide-svelte/icons/x';
  import { api, apiText } from '$lib/api';
  import MarkdownPreview from '$lib/components/MarkdownPreview.svelte';

  type BranchItem = { name: string; commit: string; title: string; updatedAt: string; isDefault: boolean; ahead: number; behind: number };
  type FileItem = { path: string; name: string; kind: 'folder' | 'file'; size?: string; message: string; updatedAt: string };
  type CommitItem = { id: string; shortId: string; title: string; author: string; authoredAt: string; verified: boolean };

  const owner = $derived($page.params.owner ?? 'lantharos');
  const repo = $derived($page.params.repo ?? 'sty');
  let branchOpen = $state(false);
  let fileFinderOpen = $state(false);
  let codeOpen = $state(false);
  let selectedBranch = $state('main');
  let fileQuery = $state('');
  let copied = $state(false);
  let finderInput = $state<HTMLInputElement>();
  let branchItems = $state<BranchItem[]>([]);
  let fileItems = $state<FileItem[]>([]);
  let latestCommit = $state<CommitItem | null>(null);
  let readme = $state('');
  let liveError = $state(false);
  const matchingFiles = $derived(fileItems.filter((item) => item.name.toLowerCase().includes(fileQuery.toLowerCase())));
  const cloneUrl = $derived(`https://sty.sh/${owner}/${repo}.git`);

  async function copyCloneUrl() {
    await navigator.clipboard.writeText(cloneUrl);
    copied = true;
    setTimeout(() => (copied = false), 1600);
  }

  async function openFileFinder() {
    fileFinderOpen = true;
    await tick();
    finderInput?.focus();
  }

  async function loadTree(branch: string) {
    const result = await api<{ entries: Array<{ path: string; name: string; kind: 'blob' | 'tree'; byteSize?: number }> }>(`/repositories/${owner}/${repo}/tree?revision=${encodeURIComponent(branch)}`);
    fileItems = result.entries.map((entry) => ({ path: entry.path, name: entry.name, kind: entry.kind === 'tree' ? 'folder' : 'file', size: entry.byteSize ? `${entry.byteSize} B` : undefined, message: latestCommit?.title ?? '', updatedAt: latestCommit?.authoredAt ?? '' }));
    try { readme = await apiText(`/repositories/${owner}/${repo}/blob/${encodeURIComponent(branch)}/README.md`); } catch { readme = ''; }
  }

  async function chooseBranch(name: string) {
    selectedBranch = name; branchOpen = false;
    try { await loadTree(name); } catch { liveError = true; }
  }

  onMount(async () => {
    try {
      const [branchData, commitData] = await Promise.all([
        api<{ defaultBranch: string; branches: Array<{ name: string; commitId: string; title: string; updatedAt: string }> }>(`/repositories/${owner}/${repo}/branches`),
        api<{ commits: Array<{ id: string; shortId: string; title: string; author: string; authoredAt: string; signatureStatus: string }> }>(`/repositories/${owner}/${repo}/commits?limit=100`)
      ]);
      selectedBranch = branchData.defaultBranch;
      branchItems = branchData.branches.map((branch) => ({ name: branch.name, commit: branch.commitId.slice(0, 7), title: branch.title, updatedAt: branch.updatedAt, isDefault: branch.name === branchData.defaultBranch, ahead: 0, behind: 0 }));
      if (commitData.commits[0]) latestCommit = { ...commitData.commits[0], verified: commitData.commits[0].signatureStatus === 'verified' };
      await loadTree(selectedBranch);
    } catch { liveError = true; }
  });
</script>

<svelte:head>
  <title>{owner}/{repo} · Sty</title>
</svelte:head>

<div class="code-toolbar">
  <div class="branch-group">
    <div class="popover-anchor">
      <button class="branch-button" aria-expanded={branchOpen} onclick={() => (branchOpen = !branchOpen)}><GitBranch size={15} /><span>{selectedBranch}</span><ChevronDown size={13} /></button>
      {#if branchOpen}<div class="branch-menu"><label><Search size={13} /><input placeholder="Find a branch" /></label>{#each branchItems as branch}<button class:chosen={branch.name === selectedBranch} onclick={() => void chooseBranch(branch.name)}><span><strong>{branch.name}</strong><small>{branch.commit} · {branch.updatedAt}</small></span>{#if branch.name === selectedBranch}<Check size={14} />{/if}</button>{/each}</div>{/if}
    </div>
    <a href="/{owner}/{repo}/branches"><GitBranch size={14} />{branchItems.length} branches</a>
  </div>
  <div class="code-actions">
    <button onclick={openFileFinder}>Go to file</button>
    <div class="popover-anchor"><button class="code-button" aria-expanded={codeOpen} onclick={() => (codeOpen = !codeOpen)}><Code2 size={15} />Code<ChevronDown size={13} /></button>{#if codeOpen}<div class="code-menu"><strong>Clone this repository</strong><p>Use HTTPS with your Sty credentials.</p><div><code>{cloneUrl}</code><button aria-label="Copy clone URL" onclick={copyCloneUrl}>{#if copied}<Check size={14} />{:else}<Copy size={14} />{/if}</button></div><a href="https://sty.sh/docs/cli">Open in Sty CLI</a></div>{/if}</div>
  </div>
</div>

<div class="code-layout">
  <div class="code-main">
    <section class="file-browser" aria-label="Repository files">
      {#if latestCommit}<header class="latest-commit">
        <span class="commit-avatar">KI</span>
          <span class="commit-copy"><strong>{latestCommit.author}</strong><span>{latestCommit.title}</span></span>
          <a class="commit-id" href="/{owner}/{repo}/commit/{latestCommit.shortId}">{latestCommit.shortId}</a>
        <span class="passed"><Check size={13} />Passed</span>
        <a class="history" href="/{owner}/{repo}/commits/{selectedBranch}"><History size={14} />History</a>
      </header>{/if}

      <div class="file-list">
        {#each fileItems as item}
          <a class="file-row" href="/{owner}/{repo}/{item.kind === 'folder' ? 'tree' : 'blob'}/{selectedBranch}/{item.name}">
            <span class="file-name">
              {#if item.kind === 'folder'}<Folder size={16} fill="currentColor" />{:else}<File size={16} />{/if}
              <strong>{item.name}</strong>
            </span>
            <span class="file-message">{item.message}</span>
            <time>{item.updatedAt}</time>
          </a>
        {:else}<div class="empty-tree">{liveError ? 'Repository files could not be loaded.' : 'This branch is empty.'}</div>{/each}
      </div>
    </section>

    <article class="readme">
      <header><span><BookOpen size={16} />README.md</span><button aria-label="README actions"><MoreHorizontal size={18} /></button></header>
      <div class="readme-content">
        {#if readme}<MarkdownPreview source={readme} />{:else}<p class="no-readme">This repository does not have a README on {selectedBranch}.</p>{/if}
      </div>
    </article>
  </div>

</div>
{#if liveError}<div class="live-notice" role="alert">Repository data could not be loaded. Refresh to try again.</div>{/if}

{#if fileFinderOpen}
  <div class="finder-layer" role="presentation" onclick={(event) => event.currentTarget === event.target && (fileFinderOpen = false)}>
    <div class="file-finder" role="dialog" aria-modal="true" aria-label="Go to file">
      <header><Search size={17} /><input bind:this={finderInput} bind:value={fileQuery} placeholder="Search files in this repository" /><button aria-label="Close file finder" onclick={() => (fileFinderOpen = false)}><X size={16} /></button></header>
      <div>{#each matchingFiles as item}<a href="/{owner}/{repo}/{item.kind === 'folder' ? 'tree' : 'blob'}/{selectedBranch}/{item.path}"><span>{#if item.kind === 'folder'}<Folder size={15} />{:else}<File size={15} />{/if}{item.path}</span><small>{item.kind}</small></a>{/each}</div>
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
  .code-button { border-color: var(--brand); background: var(--brand); color: white; }
  .code-button:hover { background: var(--brand-hover); color: white; }
  .branch-menu, .code-menu { position: absolute; top: 40px; z-index: 20; width: 290px; padding: 6px; border: 1px solid var(--border-strong); border-radius: 9px; background: var(--surface); box-shadow: var(--shadow-card); }
  .branch-menu { left: 0; } .branch-menu label { display: flex; align-items: center; gap: 6px; height: 31px; margin-bottom: 4px; padding: 0 8px; border: 1px solid var(--border); border-radius: 6px; color: var(--text-faint); } .branch-menu input { min-width: 0; flex: 1; border: 0; outline: 0; background: transparent; color: var(--text-strong); font-size: 10px; } .branch-menu > button { display: flex; width: 100%; height: auto; min-height: 46px; align-items: center; justify-content: space-between; border: 0; } .branch-menu > button.chosen { background: var(--brand-soft); color: var(--brand); } .branch-menu strong, .branch-menu small { display: block; text-align: left; } .branch-menu strong { color: var(--text-strong); font-size: 11px; } .branch-menu small { margin-top: 3px; color: var(--text-faint); font-size: 9px; }
  .code-menu { right: 0; width: 330px; padding: 13px; } .code-menu > strong { color: var(--text-strong); font-size: 11px; } .code-menu > p { margin: 4px 0 10px; color: var(--text-faint); font-size: 9px; } .code-menu > div { display: grid; grid-template-columns: minmax(0,1fr) 32px; overflow: hidden; border: 1px solid var(--border); border-radius: 6px; background: var(--surface-muted); } .code-menu code { overflow: hidden; padding: 9px; color: var(--text-muted); font-size: 9px; text-overflow: ellipsis; white-space: nowrap; } .code-menu div button { width: 32px; height: 32px; padding: 0; border-width: 0 0 0 1px; border-radius: 0; } .code-menu > a { display: block; margin-top: 10px; color: var(--brand); font-size: 10px; font-weight: 600; text-decoration: none; }
  .code-layout { display: block; }
  .code-main { min-width: 0; }
  .file-browser, .readme { overflow: hidden; border: 1px solid var(--border); border-radius: 9px; background: var(--surface); box-shadow: var(--shadow-subtle); }
  .latest-commit { display: grid; grid-template-columns: 27px minmax(0, 1fr) auto auto auto; min-height: 48px; align-items: center; gap: 9px; padding: 7px 11px; border-bottom: 1px solid var(--border); background: var(--surface-muted); }
  .commit-avatar { display: grid; width: 25px; height: 25px; place-items: center; border-radius: 50%; background: #d5b496; color: #3d2518; font-size: 9px; font-weight: 740; }
  .commit-copy { display: flex; min-width: 0; gap: 5px; overflow: hidden; font-size: 11px; white-space: nowrap; }
  .commit-copy strong { color: var(--text-strong); font-weight: 630; }
  .commit-copy span { overflow: hidden; color: var(--text-muted); text-overflow: ellipsis; }
  .commit-id { color: var(--text-faint); font-family: "SFMono-Regular", Consolas, monospace; font-size: 9px; text-decoration: none; }
  .passed { display: inline-flex; align-items: center; gap: 3px; color: var(--success); font-size: 9px; font-weight: 620; }
  .history { display: inline-flex; align-items: center; gap: 4px; color: var(--text-muted); font-size: 10px; text-decoration: none; }
  .file-row { display: grid; grid-template-columns: minmax(160px, .7fr) minmax(200px, 1fr) 100px; min-height: 39px; align-items: center; gap: 14px; padding: 0 11px; border-top: 1px solid var(--border-subtle); color: inherit; text-decoration: none; }
  .file-row:first-child { border-top: 0; }
  .file-row:hover { background: var(--surface-hover); }
  .file-name { display: flex; min-width: 0; align-items: center; gap: 8px; color: var(--brand); }
  .file-name strong { overflow: hidden; color: var(--text-strong); font-size: 11px; font-weight: 570; text-overflow: ellipsis; white-space: nowrap; }
  .file-message { overflow: hidden; color: var(--text-muted); font-size: 10px; text-overflow: ellipsis; white-space: nowrap; }
  .file-row time { color: var(--text-faint); font-size: 9px; text-align: right; }
  .empty-tree { padding: 30px 12px; color: var(--text-faint); font-size: 10px; text-align: center; }
  .readme { margin-top: 18px; }
  .readme > header { display: flex; min-height: 43px; align-items: center; justify-content: space-between; padding: 0 11px 0 14px; border-bottom: 1px solid var(--border); background: var(--surface-muted); }
  .readme > header span { display: inline-flex; align-items: center; gap: 7px; color: var(--text-strong); font-size: 11px; font-weight: 630; }
  .readme > header button { width: 30px; height: 30px; padding: 0; border-color: transparent; background: transparent; }
  .readme-content { padding: 26px 30px 34px; }
  .no-readme { margin: 0; color: var(--text-faint); font-size: 11px; }
  .live-notice { position: fixed; right: 20px; bottom: 20px; z-index: 30; padding: 9px 11px; border: 1px solid var(--warning); border-radius: 7px; background: var(--warning-soft); color: var(--warning); font-size: 10px; box-shadow: var(--shadow-card); }
  .finder-layer { position: fixed; z-index: 100; inset: 0; display: flex; justify-content: center; padding-top: 90px; background: rgb(0 0 0 / .58); backdrop-filter: blur(3px); } .file-finder { width: min(620px, calc(100vw - 28px)); height: fit-content; max-height: min(560px, calc(100vh - 130px)); overflow: hidden; border: 1px solid var(--border-strong); border-radius: 9px; background: var(--surface); box-shadow: var(--shadow-card); } .file-finder header { display: flex; align-items: center; gap: 9px; padding: 11px 12px; border-bottom: 1px solid var(--border); color: var(--text-faint); } .file-finder header input { min-width: 0; flex: 1; border: 0; outline: 0; background: transparent; color: var(--text-strong); font-size: 13px; } .file-finder header button { width: 28px; height: 28px; padding: 0; border: 0; } .file-finder > div { overflow-y: auto; max-height: 470px; padding: 6px; } .file-finder a { display: flex; min-height: 38px; align-items: center; justify-content: space-between; padding: 0 9px; border-radius: 6px; color: var(--text); font-size: 11px; text-decoration: none; } .file-finder a:hover { background: var(--brand-soft); } .file-finder a span { display: flex; align-items: center; gap: 7px; } .file-finder a small { color: var(--text-faint); font-size: 9px; }

  @media (max-width: 1080px) {
    .code-layout { grid-template-columns: 1fr; }
  }

  @media (max-width: 680px) {
    .branch-group a { display: none; }
    .code-actions button:first-child { display: none; }
    .latest-commit { grid-template-columns: 27px minmax(0, 1fr) auto; }
    .commit-id, .passed { display: none; }
    .file-row { grid-template-columns: minmax(0, 1fr) 76px; }
    .file-message { display: none; }
    .readme-content { padding: 22px 19px 28px; }
  }
</style>
