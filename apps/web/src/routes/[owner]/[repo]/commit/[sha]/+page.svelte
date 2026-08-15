<script lang="ts">
  import { page } from '$app/stores';
  import { onMount } from 'svelte';
  import BadgeCheck from 'lucide-svelte/icons/badge-check';
  import Copy from 'lucide-svelte/icons/copy';
  import FileDiff from 'lucide-svelte/icons/file-diff';
  import GitCommitHorizontal from 'lucide-svelte/icons/git-commit-horizontal';
  import { api, StyApiError } from '$lib/api';

  type FileChange = { path: string; oldPath?: string; status: string; additions: number; deletions: number; patch: string };
  type Commit = { id: string; parents: string[]; title: string; body: string; author: string; authorEmail: string; authoredAt: string; signatureStatus: string; files: FileChange[] };
  type PatchLine = { kind: 'meta' | 'context' | 'added' | 'removed'; text: string; oldLine: number | null; newLine: number | null };

  const owner = $derived($page.params.owner);
  const repo = $derived($page.params.repo);
  const sha = $derived($page.params.sha ?? '');
  const base = $derived(`/${owner}/${repo}`);
  let commit = $state<Commit | null>(null);
  let error = $state('');
  let copied = $state(false);

  function patchLines(patch: string): PatchLine[] {
    let oldLine = 0, newLine = 0;
    return patch.split('\n').map((text) => {
      const hunk = text.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)/);
      if (hunk) { oldLine = Number(hunk[1]); newLine = Number(hunk[2]); return { kind: 'meta', text, oldLine: null, newLine: null }; }
      if (text.startsWith('+++') || text.startsWith('---') || text.startsWith('diff ') || text.startsWith('index ')) return { kind: 'meta', text, oldLine: null, newLine: null };
      if (text.startsWith('+')) return { kind: 'added', text, oldLine: null, newLine: newLine++ };
      if (text.startsWith('-')) return { kind: 'removed', text, oldLine: oldLine++, newLine: null };
      return { kind: 'context', text, oldLine: oldLine++, newLine: newLine++ };
    });
  }

  onMount(async () => {
    try { commit = await api<Commit>(`/repositories/${owner}/${repo}/commits/${sha}`); }
    catch (cause) { error = cause instanceof StyApiError ? cause.message : 'This commit could not be loaded.'; }
  });

  async function copy() {
    if (!commit) return;
    await navigator.clipboard.writeText(commit.id);
    copied = true;
    setTimeout(() => (copied = false), 1200);
  }
</script>

<svelte:head><title>{commit?.id.slice(0, 7) ?? sha} · {owner}/{repo} · Sty</title></svelte:head>

{#if commit}
  <header class="commit-head">
    <div class="heading"><GitCommitHorizontal size={20} /><div><h1>{commit.title}</h1>{#if commit.body}<p>{commit.body}</p>{/if}</div></div>
    <div class="meta"><span class="avatar">{commit.author.slice(0, 2).toUpperCase()}</span><strong>{commit.author}</strong><span>&lt;{commit.authorEmail}&gt;</span><time>{commit.authoredAt}</time>{#if commit.signatureStatus === 'verified'}<i><BadgeCheck size={13} />Verified</i>{/if}</div>
    <div class="identity"><code>{commit.id}</code><button aria-label="Copy commit hash" onclick={copy}>{#if copied}Copied{:else}<Copy size={13} />{/if}</button></div>
    <div class="parents">{#each commit.parents as parent}<a href="{base}/commit/{parent}">Parent {parent.slice(0, 7)}</a>{/each}<a href="{base}/tree/{commit.id}">Browse files</a></div>
  </header>

  <div class="change-summary"><FileDiff size={15} /><strong>{commit.files.length} changed {commit.files.length === 1 ? 'file' : 'files'}</strong><span><b>+{commit.files.reduce((sum, file) => sum + file.additions, 0)}</b><i>−{commit.files.reduce((sum, file) => sum + file.deletions, 0)}</i></span></div>
  <main class="diffs">
    {#each commit.files as file}
      <section class="diff" id="file-{file.path.replaceAll('/', '-')}">
        <header><strong>{file.oldPath ? `${file.oldPath} → ${file.path}` : file.path}</strong><span>{file.status}</span><small><b>+{file.additions}</b><i>−{file.deletions}</i></small></header>
        <div class="patch"><table><tbody>{#each patchLines(file.patch) as line}<tr class={line.kind}><td>{line.oldLine ?? ''}</td><td>{line.newLine ?? ''}</td><td><pre>{line.text || ' '}</pre></td></tr>{/each}</tbody></table></div>
      </section>
    {:else}
      <div class="empty"><strong>No file changes</strong><p>This commit does not change the tree relative to its first parent.</p></div>
    {/each}
  </main>
{:else if error}
  <div class="error"><strong>Commit unavailable</strong><p>{error}</p></div>
{:else}
  <div class="loading" aria-busy="true"><i></i><i></i><i></i></div>
{/if}

<style>
  .commit-head{position:relative;padding:5px 0 22px;border-bottom:1px solid var(--border)}.heading{display:flex;align-items:flex-start;gap:9px;color:var(--brand)}.heading h1{max-width:790px;margin:0;color:var(--text-strong);font-size:20px;font-weight:660;letter-spacing:-.025em}.heading p{max-width:760px;margin:8px 0 0;color:var(--text-muted);font-size:11px;line-height:1.55;white-space:pre-wrap}.meta{display:flex;align-items:center;gap:6px;margin-top:14px;color:var(--text-faint);font-size:9px}.avatar{display:grid;width:24px;height:24px;place-items:center;border-radius:50%;background:#d5b496;color:#3d2518;font-size:8px;font-weight:740}.meta strong{color:var(--text-strong)}.meta time{margin-left:3px}.meta i{display:flex;align-items:center;gap:3px;color:var(--success);font-style:normal}.identity{position:absolute;top:0;right:0;display:flex;max-width:310px;border:1px solid var(--border);border-radius:6px}.identity code{overflow:hidden;padding:8px;color:var(--text-muted);font-size:8px;text-overflow:ellipsis}.identity button{display:grid;min-width:34px;place-items:center;border:0;border-left:1px solid var(--border);background:transparent;color:var(--text-muted);cursor:pointer;font-size:8px}.parents{display:flex;gap:12px;margin-top:13px}.parents a{color:var(--brand);font-size:9px;text-decoration:none}.parents a:last-child{margin-left:auto}.change-summary{display:flex;align-items:center;gap:7px;padding:16px 1px 11px;color:var(--text-muted);font-size:10px}.change-summary strong{color:var(--text-strong)}.change-summary span{display:flex;gap:6px;margin-left:auto}.change-summary b,.diff b{color:var(--success)}.change-summary i,.diff i{color:var(--danger);font-style:normal}.diffs{display:grid;gap:16px}.diff{overflow:hidden;border:1px solid var(--border);border-radius:8px;background:var(--surface)}.diff>header{display:flex;min-height:43px;align-items:center;gap:8px;padding:0 11px;border-bottom:1px solid var(--border);background:var(--surface-muted)}.diff header strong{overflow:hidden;color:var(--text-strong);font-family:monospace;font-size:10px;text-overflow:ellipsis}.diff header>span{padding:2px 5px;border-radius:4px;background:var(--surface);color:var(--text-faint);font-size:8px;text-transform:capitalize}.diff header small{display:flex;gap:5px;margin-left:auto}.patch{overflow:auto}.patch table{width:100%;border-collapse:collapse}.patch td{padding:0}.patch td:nth-child(1),.patch td:nth-child(2){width:40px;padding:0 7px;border-right:1px solid var(--border-subtle);background:var(--surface-muted);color:var(--text-faint);font-family:monospace;font-size:9px;text-align:right;user-select:none}.patch pre{margin:0;padding:0 9px;color:var(--text);font-family:monospace;font-size:9px;line-height:20px;white-space:pre}.patch tr.added td{background:var(--success-soft)}.patch tr.added pre{color:var(--success)}.patch tr.removed td{background:var(--danger-soft)}.patch tr.removed pre{color:var(--danger)}.patch tr.meta td:last-child{background:var(--brand-soft)}.patch tr.meta pre{color:var(--brand)}.empty,.error{padding:50px 0;border-top:1px solid var(--border-subtle);color:var(--text-faint);text-align:center}.empty strong,.error strong{color:var(--text-strong);font-size:12px}.empty p,.error p{font-size:10px}.loading{display:grid;gap:10px}.loading i{height:80px;border-radius:8px;background:var(--surface-muted);animation:pulse 1.2s infinite alternate}.loading i+ i{height:220px}@keyframes pulse{to{opacity:.5}}@media(max-width:760px){.identity{position:static;width:100%;max-width:none;margin-top:14px}.meta{flex-wrap:wrap}.meta time{width:100%;margin-left:30px}.parents a:last-child{margin-left:0}}
</style>
