<script lang="ts">
  import type { PullRequestDiff, ReviewThread as ReviewThreadType } from '@marl/contracts';
  import ChevronDown from 'lucide-svelte/icons/chevron-down';
  import ChevronUp from 'lucide-svelte/icons/chevron-up';
  import FileWarning from 'lucide-svelte/icons/file-warning';
  import Files from 'lucide-svelte/icons/files';
  import MessageSquarePlus from 'lucide-svelte/icons/message-square-plus';
  import Search from 'lucide-svelte/icons/search';
  import { dismissable } from '$lib/actions/dismissable';
  import { parsePatchLines, type PatchLine } from '$lib/diff';
  import Button from './Button.svelte';
  import CommentComposer from './CommentComposer.svelte';
  import ReviewThread from './ReviewThread.svelte';
  import type { MarkdownContext } from '$lib/markdown';

  type Draft = { path: string; side: 'old' | 'new'; startLine: number; line: number };
  type DiffFile = PullRequestDiff['files'][number];
  type CollapseReason = 'deleted' | 'large' | 'lazy' | null;

  const LARGE_DIFF_LINES = 1_000;
  const LARGE_DIFF_BYTES = 200_000;

  let { files, threads = [], busy = false, reviewable = true, context, onLoadPatch = async (file: DiffFile) => file.patch, onCreate = async () => {}, onReply = async () => {}, onResolve = async () => {}, onEdit = async () => {}, onDelete = async () => {} } = $props<{
    files: PullRequestDiff['files']; threads?: ReviewThreadType[]; busy?: boolean; reviewable?: boolean;
    context?: MarkdownContext;
    onLoadPatch?: (file: DiffFile) => Promise<string>;
    onCreate?: (draft: Draft, body: string) => Promise<void>; onReply?: (threadId: string, body: string) => Promise<void>;
    onResolve?: (threadId: string, resolved: boolean) => Promise<void>; onEdit?: (commentId: string, body: string) => Promise<void>; onDelete?: (commentId: string) => Promise<void>;
  }>();

  let drag = $state<{ path: string; side: 'old' | 'new'; anchor: number; current: number } | null>(null);
  let draft = $state<Draft | null>(null);
  let body = $state('');
  let navigatorOpen = $state(false);
  let fileQuery = $state('');
  let expandedFiles = $state<Record<string, boolean>>({});
  let loadedPatches = $state<Record<string, string>>({});
  let loadingFiles = $state<Record<string, boolean>>({});
  let failedFiles = $state<Record<string, boolean>>({});

  function collapseReason(file: DiffFile): CollapseReason {
    if (file.patchOmitted) return file.patchOmitted;
    if (file.status === 'deleted') return 'deleted';
    if (file.additions + file.deletions >= LARGE_DIFF_LINES || file.patch.length >= LARGE_DIFF_BYTES) return 'large';
    return null;
  }

  const parsedFiles = $derived(files.map((file: DiffFile) => {
    const reason = collapseReason(file);
    const expanded = !reason || expandedFiles[file.path] === true;
    const patch = loadedPatches[file.path] ?? file.patch;
    return { ...file, patch, reason, expanded, loading: loadingFiles[file.path] === true, failed: failedFiles[file.path] === true, lines: expanded ? parsePatchLines(patch) : [] };
  }));
  const additions = $derived(files.reduce((total: number, file: DiffFile) => total + file.additions, 0));
  const deletions = $derived(files.reduce((total: number, file: DiffFile) => total + file.deletions, 0));
  const matchingFiles = $derived(parsedFiles.filter((file: DiffFile) => file.path.toLowerCase().includes(fileQuery.trim().toLowerCase())));
  const threadIndex = $derived.by(() => {
    const index: Record<string, ReviewThreadType[]> = {};
    for (const thread of threads) {
      if (thread.outdated) continue;
      const key = `${thread.path}:${thread.side}:${thread.line}`;
      index[key] = [...(index[key] ?? []), thread];
    }
    return index;
  });

  function beginRange(event: PointerEvent, path: string, line: PatchLine) {
    if (!line.side || line.line === null) return;
    event.preventDefault(); drag = { path, side: line.side, anchor: line.line, current: line.line }; draft = null; body = '';
  }
  function openSingle(path: string, line: PatchLine) {
    if (!line.side || line.line === null) return;
    draft = { path, side: line.side, startLine: line.line, line: line.line }; drag = null; body = '';
  }
  function extendRange(path: string, line: PatchLine) {
    if (drag && drag.path === path && drag.side === line.side && line.line !== null) drag.current = line.line;
  }
  function finishRange() {
    if (!drag) return;
    draft = { path: drag.path, side: drag.side, startLine: Math.min(drag.anchor, drag.current), line: Math.max(drag.anchor, drag.current) }; drag = null;
  }
  function selected(path: string, line: PatchLine) {
    const range = drag?.path === path && drag.side === line.side ? { startLine: Math.min(drag.anchor, drag.current), line: Math.max(drag.anchor, drag.current), side: drag.side } : draft?.path === path ? draft : null;
    return Boolean(range && line.side === range.side && line.line !== null && line.line >= range.startLine && line.line <= range.line);
  }
  function threadsAt(path: string, line: PatchLine) { return threadIndex[`${path}:${line.side}:${line.line}`] ?? []; }
  function draftAt(path: string, line: PatchLine) { return draft?.path === path && draft.side === line.side && draft.line === line.line ? draft : null; }
  function fileAnchor(index: number) { return `changed-file-${index + 1}`; }
  function visible(node: HTMLElement, load: () => void) {
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      observer.disconnect(); load();
    }, { rootMargin: '800px 0px' });
    observer.observe(node);
    return { destroy: () => observer.disconnect() };
  }
  function goToFile(file: (typeof parsedFiles)[number]) {
    const index = parsedFiles.indexOf(file);
    document.getElementById(fileAnchor(index))?.scrollIntoView({ behavior: 'smooth', block: 'start' }); navigatorOpen = false; fileQuery = '';
  }
  async function expandFile(file: (typeof parsedFiles)[number]) {
    if (file.patchOmitted && loadedPatches[file.path] === undefined) {
      loadingFiles[file.path] = true;
      failedFiles[file.path] = false;
      try {
        loadedPatches[file.path] = await onLoadPatch(file);
      } catch {
        failedFiles[file.path] = true;
        return;
      } finally {
        loadingFiles[file.path] = false;
      }
    }
    expandedFiles[file.path] = true;
  }
  async function submit() {
    if (!draft || !body.trim()) return;
    await onCreate(draft, body); draft = null; body = '';
  }
</script>

<svelte:window onpointerup={finishRange} />

<div class="diff-viewer">
  <div class="diff-toolbar">
    <div class="summary"><Files size={15} /><strong>{files.length} changed {files.length === 1 ? 'file' : 'files'}</strong><span><b>+{additions}</b><i>−{deletions}</i></span></div>
    {#if files.length > 1}<div class="navigator" use:dismissable={() => (navigatorOpen = false)}><Button class="navigator-trigger" size="small" aria-expanded={navigatorOpen} onclick={() => (navigatorOpen = !navigatorOpen)}>Jump to file <ChevronDown size={13} /></Button>{#if navigatorOpen}<div class="navigator-menu"><label><Search size={13} /><input bind:value={fileQuery} placeholder="Find a changed file" /></label><div class="navigator-list">{#each matchingFiles as file (file.path)}<Button class="file-choice" variant="ghost" block onclick={() => goToFile(file)}><span>{file.path}</span><small><b>+{file.additions}</b><i>−{file.deletions}</i></small></Button>{:else}<p>No matching files</p>{/each}</div></div>{/if}</div>{/if}
  </div>
  <main class="diffs">
    {#each parsedFiles as file, index (file.path)}
      <section class="diff" id={fileAnchor(index)} use:visible={() => file.reason === 'lazy' && void expandFile(file)}>
        <header><strong>{file.path}</strong><span>{file.status}</span><small><b>+{file.additions}</b><i>−{file.deletions}</i></small>{#if file.reason && file.expanded}<Button class="collapse-file" icon size="small" variant="ghost" aria-label="Collapse {file.path}" title="Collapse file" onclick={() => (expandedFiles[file.path] = false)}><ChevronUp size={14} /></Button>{/if}</header>
        <div class="patch">
          {#if !file.expanded}
            <div class="collapsed-patch"><FileWarning size={18} /><div><strong>{file.reason === 'deleted' ? 'Deleted file hidden' : file.reason === 'large' ? 'Large diff hidden' : 'Loading diff'}</strong><p>{file.failed ? 'The file diff could not be loaded. Try again.' : file.reason === 'deleted' ? 'Expand this file to inspect its previous contents.' : file.reason === 'large' ? `This diff changes ${(file.additions + file.deletions).toLocaleString()} lines and is collapsed to keep the page responsive.` : 'The patch loads when this file approaches the viewport.'}</p></div><Button size="small" loading={file.loading} onclick={() => expandFile(file)}>{file.failed ? 'Try again' : file.reason === 'deleted' ? 'Show deleted file' : 'Load diff'}</Button></div>
          {:else}
            {#if file.lines.length === 0}<div class="empty-patch">No textual diff is available for this file.</div>{/if}
            {#each file.lines as line (`${file.path}:${line.key}`)}
              <div class="line {line.kind}" class:selected={selected(file.path, line)} role="group" onpointerenter={() => extendRange(file.path, line)}><div class="gutter">{#if line.line !== null}<span>{line.line}</span>{#if reviewable}<Button class="line-comment" icon size="small" variant="primary" aria-label="Comment on line {line.line}; drag to select a range" onpointerdown={(event) => beginRange(event, file.path, line)} onclick={() => openSingle(file.path, line)}><MessageSquarePlus size={14} /></Button>{/if}{/if}</div><pre>{line.text || ' '}</pre></div>
              {#each threadsAt(file.path, line) as thread (thread.id)}<ReviewThread {thread} {busy} {context} inline interactive={reviewable} onReply={onReply} onResolve={onResolve} onEdit={onEdit} onDelete={onDelete} />{/each}
              {@const activeDraft = draftAt(file.path, line)}
              {#if activeDraft}<div class="draft"><div class="range-label">Commenting on {activeDraft.startLine === activeDraft.line ? `line ${activeDraft.line}` : `lines ${activeDraft.startLine}–${activeDraft.line}`}</div><CommentComposer bind:value={body} {context} placeholder="Leave a review comment" submitLabel="Add review comment" minHeight={92} {busy} onSubmit={submit} onCancel={() => { draft = null; body = ''; }} /></div>{/if}
            {/each}
          {/if}
        </div>
      </section>
    {/each}
  </main>
</div>

<style>
  .diff-viewer{min-width:0}.diff-toolbar{position:sticky;top:52px;z-index:8;display:flex;align-items:center;justify-content:space-between;min-height:44px;margin-bottom:12px;padding:0 2px;background:var(--canvas)}.summary,.summary span{display:flex;align-items:center;gap:7px}.summary{color:var(--text-muted);font-size:11px}.summary strong{color:var(--text-strong)}.summary span{margin-left:4px;font-size:11px}.summary b,.navigator-list b{color:var(--success)}.summary i,.navigator-list i{color:var(--danger);font-style:normal}.navigator{position:relative}.navigator :global(.navigator-trigger.button){font-size:11px}.navigator-menu{position:absolute;top:calc(100% + 6px);right:0;width:min(420px,calc(100vw - 32px));overflow:hidden;border:1px solid var(--border);border-radius:8px;background:var(--surface-raised);box-shadow:0 14px 40px rgb(0 0 0/.35)}.navigator-menu label{display:flex;align-items:center;gap:7px;margin:8px;padding:0 9px;border:1px solid var(--border);border-radius:6px;color:var(--text-faint)}.navigator-menu input{width:100%;height:32px;border:0;outline:0;background:transparent;color:var(--text);font:12px var(--font-mono)}.navigator-list{max-height:320px;overflow:auto;border-top:1px solid var(--border-subtle)}.navigator-list :global(.file-choice.button){min-height:38px;height:auto;justify-content:space-between;padding:6px 10px;border-radius:0;border-top:1px solid var(--border-subtle);font-size:11px;text-align:left}.navigator-list :global(.file-choice.button:first-child){border-top:0}.navigator-list :global(.file-choice span){overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.navigator-list small{display:flex;flex:0 0 auto;gap:5px;font-size:11px}.navigator-list p{margin:18px;color:var(--text-faint);font-size:11px;text-align:center}.diffs{display:grid;min-width:0;gap:16px}.diff{scroll-margin-top:118px;overflow:hidden;border:1px solid var(--border);border-radius:9px;background:var(--surface);content-visibility:auto;contain-intrinsic-size:auto 520px}.diff>header{display:flex;min-height:43px;align-items:center;gap:8px;padding:0 12px;background:var(--surface-muted)}.diff>header strong{overflow:hidden;color:var(--text-strong);font:600 12px var(--font-mono);text-overflow:ellipsis;white-space:nowrap}.diff>header>span{padding:3px 6px;border-radius:4px;background:var(--canvas);color:var(--text-faint);font-size:11px;text-transform:capitalize}.diff>header small{display:flex;gap:6px;margin-left:auto;font-size:11px}.diff>header b{color:var(--success)}.diff>header i{color:var(--danger);font-style:normal}.collapsed-patch{display:flex;min-height:76px;align-items:center;gap:11px;padding:13px 15px;color:var(--text-faint)}.collapsed-patch>div{min-width:0}.collapsed-patch strong{display:block;color:var(--text);font-size:11px}.collapsed-patch p{margin:4px 0 0;font-size:11px}.collapsed-patch :global(.button){margin-left:auto}.empty-patch{padding:28px 14px;color:var(--text-faint);font-size:11px;text-align:center}.patch{overflow:auto;border-top:1px solid var(--border-subtle)}.line{display:grid;grid-template-columns:54px minmax(max-content,1fr);min-height:24px}.gutter{position:relative;display:flex;align-items:center;justify-content:flex-end;padding-right:9px;background:var(--surface-muted);color:var(--text-faint);font:11px var(--font-mono);user-select:none}.gutter :global(.line-comment.button){position:absolute;left:4px;display:flex;opacity:0;width:24px;min-height:24px;height:24px;padding:0;cursor:crosshair}.line:hover .gutter :global(.line-comment.button),.line:focus-within .gutter :global(.line-comment.button),.gutter :global(.line-comment.button:focus-visible){opacity:1}.line pre{margin:0;padding:0 10px;color:var(--text);font:12px/24px var(--font-mono);white-space:pre}.line.added .gutter,.line.added pre{background:var(--success-soft)}.line.added pre{color:var(--success)}.line.removed .gutter,.line.removed pre{background:var(--danger-soft)}.line.removed pre{color:var(--danger)}.line.hunk .gutter,.line.hunk pre{background:var(--brand-soft);color:var(--brand)}.line.selected .gutter{box-shadow:inset 3px 0 var(--brand)}.line.selected pre{background:color-mix(in srgb,var(--brand-soft) 68%,var(--surface))}.draft{padding:11px 12px 12px 66px;border-block:1px solid var(--border);background:var(--surface-raised)}.range-label{margin-bottom:7px;color:var(--text-faint);font-size:11px}@media(pointer:coarse){.gutter :global(.line-comment.button){opacity:1}}
  @media(max-width:600px){.diff-toolbar{top:52px}.summary>span{display:none}.diff>header>span{display:none}.collapsed-patch{align-items:flex-start}.collapsed-patch :global(.button){margin-top:1px}}
</style>
