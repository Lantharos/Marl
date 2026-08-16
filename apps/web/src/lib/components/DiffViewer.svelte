<script lang="ts">
  import type { PullRequestDiff, ReviewThread as ReviewThreadType } from '@sty/contracts';
  import MessageSquarePlus from 'lucide-svelte/icons/message-square-plus';
  import CommentComposer from './CommentComposer.svelte';
  import ReviewThread from './ReviewThread.svelte';

  type PatchLine = { kind: 'hunk' | 'context' | 'added' | 'removed'; text: string; oldLine: number | null; newLine: number | null; side: 'old' | 'new' | null; line: number | null };
  type Draft = { path: string; side: 'old' | 'new'; startLine: number; line: number };

  let {
    files,
    threads = [],
    busy = false,
    reviewable = true,
    onCreate = async () => {},
    onReply = async () => {},
    onResolve = async () => {},
    onEdit = async () => {},
    onDelete = async () => {}
  } = $props<{
    files: PullRequestDiff['files'];
    threads?: ReviewThreadType[];
    busy?: boolean;
    reviewable?: boolean;
    onCreate?: (draft: Draft, body: string) => Promise<void>;
    onReply?: (threadId: string, body: string) => Promise<void>;
    onResolve?: (threadId: string, resolved: boolean) => Promise<void>;
    onEdit?: (commentId: string, body: string) => Promise<void>;
    onDelete?: (commentId: string) => Promise<void>;
  }>();

  let drag = $state<{ path: string; side: 'old' | 'new'; anchor: number; current: number } | null>(null);
  let draft = $state<Draft | null>(null);
  let body = $state('');

  function lines(patch: string): PatchLine[] {
    let oldLine = 0;
    let newLine = 0;
    const output: PatchLine[] = [];
    for (const text of patch.split('\n')) {
      const hunk = text.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)/);
      if (hunk) {
        oldLine = Number(hunk[1]);
        newLine = Number(hunk[2]);
        output.push({ kind: 'hunk', text, oldLine: null, newLine: null, side: null, line: null });
      } else if (text.startsWith('diff ') || text.startsWith('index ') || text.startsWith('---') || text.startsWith('+++') || text.startsWith('new file ') || text.startsWith('deleted file ')) {
        continue;
      } else if (text.startsWith('+')) {
        output.push({ kind: 'added', text, oldLine: null, newLine, side: 'new', line: newLine++ });
      } else if (text.startsWith('-')) {
        output.push({ kind: 'removed', text, oldLine, newLine: null, side: 'old', line: oldLine++ });
      } else {
        output.push({ kind: 'context', text, oldLine, newLine, side: 'new', line: newLine });
        oldLine++;
        newLine++;
      }
    }
    return output;
  }

  function beginRange(event: PointerEvent, path: string, line: PatchLine) {
    if (!line.side || line.line === null) return;
    event.preventDefault();
    drag = { path, side: line.side, anchor: line.line, current: line.line };
    draft = null;
    body = '';
  }

  function openSingle(path: string, line: PatchLine) {
    if (!line.side || line.line === null) return;
    draft = { path, side: line.side, startLine: line.line, line: line.line };
    drag = null;
    body = '';
  }

  function extendRange(path: string, line: PatchLine) {
    if (!drag || drag.path !== path || drag.side !== line.side || line.line === null) return;
    drag.current = line.line;
  }

  function finishRange() {
    if (!drag) return;
    draft = { path: drag.path, side: drag.side, startLine: Math.min(drag.anchor, drag.current), line: Math.max(drag.anchor, drag.current) };
    drag = null;
  }

  function selected(path: string, line: PatchLine) {
    const range = drag?.path === path && drag.side === line.side ? { startLine: Math.min(drag.anchor, drag.current), line: Math.max(drag.anchor, drag.current), side: drag.side } : draft?.path === path ? draft : null;
    return Boolean(range && line.side === range.side && line.line !== null && line.line >= range.startLine && line.line <= range.line);
  }

  function threadsAt(path: string, line: PatchLine) {
    return threads.filter((thread: ReviewThreadType) => thread.path === path && thread.side === line.side && thread.line === line.line && !thread.outdated);
  }

  function draftAt(path: string, line: PatchLine): Draft | null {
    return draft?.path === path && draft.side === line.side && draft.line === line.line ? draft : null;
  }

  async function submit() {
    if (!draft || !body.trim()) return;
    await onCreate(draft, body);
    draft = null;
    body = '';
  }
</script>

<svelte:window onpointerup={finishRange} />

<div class="diff-layout">
  <aside class="file-index">
    {#each files as file}<a href="#file-{file.path.replaceAll('/','-')}"><span>{file.path}</span><small><b>+{file.additions}</b><i>−{file.deletions}</i></small></a>{/each}
  </aside>
  <main class="diffs">
    {#each files as file}
      <section class="diff" id="file-{file.path.replaceAll('/','-')}">
        <header><strong>{file.path}</strong><span>{file.status}</span><small><b>+{file.additions}</b><i>−{file.deletions}</i></small></header>
        <div class="patch">
          {#each lines(file.patch) as line}
            <div class="line {line.kind}" class:selected={selected(file.path, line)} role="group" onpointerenter={() => extendRange(file.path, line)}>
              <div class="gutter">
                {#if line.line !== null}<span>{line.line}</span>{#if reviewable}<button aria-label="Comment on line {line.line}; drag to select a range" onpointerdown={(event) => beginRange(event, file.path, line)} onclick={() => openSingle(file.path, line)}><MessageSquarePlus size={14} /></button>{/if}{/if}
              </div>
              <pre>{line.text || ' '}</pre>
            </div>
            {#if reviewable}{#each threadsAt(file.path, line) as thread}<ReviewThread {thread} {busy} inline onReply={onReply} onResolve={onResolve} onEdit={onEdit} onDelete={onDelete} />{/each}{/if}
            {@const activeDraft = draftAt(file.path, line)}
            {#if activeDraft}
              <div class="draft"><div class="range-label">Commenting on {activeDraft.startLine === activeDraft.line ? `line ${activeDraft.line}` : `lines ${activeDraft.startLine}–${activeDraft.line}`}</div><CommentComposer bind:value={body} placeholder="Leave a review comment" submitLabel="Add review comment" minHeight={92} {busy} onSubmit={submit} onCancel={() => { draft = null; body = ''; }} /></div>
            {/if}
          {/each}
        </div>
      </section>
    {/each}
  </main>
</div>

<style>
  .diff-layout{display:grid;grid-template-columns:220px minmax(0,1fr);align-items:start;gap:18px}.file-index{position:sticky;top:76px;overflow:hidden;border:1px solid var(--border);border-radius:8px;background:var(--surface)}.file-index a{display:flex;min-height:39px;align-items:center;justify-content:space-between;gap:8px;padding:7px 10px;border-top:1px solid var(--border-subtle);color:var(--text-muted);font-size:10px;text-decoration:none}.file-index a:first-child{border-top:0}.file-index a:hover{background:var(--surface-hover);color:var(--text-strong)}.file-index a span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.file-index small{display:flex;gap:4px;font-size:8px}.file-index b{color:var(--success)}.file-index i{color:var(--danger);font-style:normal}.diffs{display:grid;min-width:0;gap:16px}.diff{overflow:hidden;border:1px solid var(--border);border-radius:9px;background:var(--surface)}.diff>header{display:flex;min-height:43px;align-items:center;gap:8px;padding:0 12px;background:var(--surface-muted)}.diff>header strong{color:var(--text-strong);font:600 10px ui-monospace,SFMono-Regular,Consolas,monospace}.diff>header>span{padding:3px 6px;border-radius:4px;background:var(--canvas);color:var(--text-faint);font-size:8px;text-transform:capitalize}.diff>header small{display:flex;gap:6px;margin-left:auto;font-size:10px}.diff>header b{color:var(--success)}.diff>header i{color:var(--danger);font-style:normal}.patch{overflow:auto;border-top:1px solid var(--border-subtle)}.line{display:grid;grid-template-columns:54px minmax(max-content,1fr);min-height:22px}.gutter{position:relative;display:flex;align-items:center;justify-content:flex-end;padding-right:9px;background:var(--surface-muted);color:var(--text-faint);font:9px ui-monospace,SFMono-Regular,Consolas,monospace;user-select:none}.gutter button{position:absolute;left:4px;display:none;width:24px;height:20px;align-items:center;justify-content:center;padding:0;border:0;border-radius:4px;background:var(--brand);color:white;cursor:crosshair}.line:hover .gutter button,.gutter button:focus-visible{display:flex}.line pre{margin:0;padding:0 10px;color:var(--text);font:10px/22px ui-monospace,SFMono-Regular,Consolas,monospace;white-space:pre}.line.added .gutter,.line.added pre{background:var(--success-soft)}.line.added pre{color:var(--success)}.line.removed .gutter,.line.removed pre{background:var(--danger-soft)}.line.removed pre{color:var(--danger)}.line.hunk .gutter,.line.hunk pre{background:var(--brand-soft);color:var(--brand)}.line.selected .gutter{box-shadow:inset 3px 0 var(--brand)}.line.selected pre{background:color-mix(in srgb,var(--brand-soft) 68%,var(--surface))}.draft{padding:11px 12px 12px 66px;border-block:1px solid var(--border);background:var(--surface-raised)}.range-label{margin-bottom:7px;color:var(--text-faint);font-size:9px}
  @media(max-width:900px){.diff-layout{grid-template-columns:1fr}.file-index{position:static;display:flex;overflow-x:auto}.file-index a{min-width:180px;border-top:0;border-left:1px solid var(--border-subtle)}}
</style>
