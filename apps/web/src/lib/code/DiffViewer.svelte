<script lang="ts">
  import type { PullRequestDiff, ReviewThread as ReviewThreadType } from '@marl/contracts';
  import ChevronDown from '@lucide/svelte/icons/chevron-down';
  import ChevronUp from '@lucide/svelte/icons/chevron-up';
  import FileWarning from '@lucide/svelte/icons/file-exclamation-point';
  import Files from '@lucide/svelte/icons/files';
  import MessageSquarePlus from '@lucide/svelte/icons/message-square-plus';
  import { dismissable } from '$lib/actions/dismissable';
  import { popoverMotion } from '$lib/ui/popover';
  import { parsePatchLines, type PatchLine } from '$lib/code/diff';
  import Button from '../components/controls/Button.svelte';
  import SearchField from '../components/controls/SearchField.svelte';
  import DiffStat from './DiffStat.svelte';
  import Tokens from '$lib/code/Tokens.svelte';
  import { comparisonTokens, type CodeComparison, type ComparisonTokens } from '$lib/code/comparison';
  import CommentComposer from '../components/markdown/CommentComposer.svelte';
  import ReviewThread from '../pulls/review/ReviewThread.svelte';
  import type { MarkdownContext } from '$lib/markdown/context';

  type Draft = { path: string; side: 'old' | 'new'; startLine: number; line: number };
  type DiffFile = PullRequestDiff['files'][number];
  type CollapseReason = 'deleted' | 'large' | 'lazy' | null;

  const LARGE_DIFF_LINES = 1_000;
  const LARGE_DIFF_BYTES = 200_000;

  let {
    files,
    comparison,
    threads = [],
    busy = false,
    reviewable = true,
    canResolve = false,
    canModerate = false,
    viewerId,
    context,
    onLoadPatch = async (file: DiffFile) => file.patch,
    onCreate = async () => {},
    onReply = async () => {},
    onResolve = async () => {},
    onEdit = async () => {},
    onDelete = async () => {}
  }: {
    files: PullRequestDiff['files'];
    threads?: ReviewThreadType[];
    busy?: boolean;
    reviewable?: boolean;
    canResolve?: boolean;
    canModerate?: boolean;
    viewerId?: string;
    context?: MarkdownContext;
    comparison?: CodeComparison;
    onLoadPatch?: (file: DiffFile) => Promise<string>;
    onCreate?: (draft: Draft, body: string) => Promise<void>;
    onReply?: (threadId: string, body: string) => Promise<void>;
    onResolve?: (threadId: string, resolved: boolean) => Promise<void>;
    onEdit?: (commentId: string, body: string) => Promise<void>;
    onDelete?: (commentId: string) => Promise<void>;
  } = $props();

  let highlighted = $state.raw<Record<string, ComparisonTokens>>({});
  const highlighting = new Map<string, AbortController>();
  $effect(() => {
    files;
    comparison;
    highlighted = {};
    expandedFiles = {};
    loadedPatches = {};
    return () => {
      for (const abort of highlighting.values()) abort.abort();
      highlighting.clear();
    };
  });
  async function colorFile(file: DiffFile) {
    if (!comparison || highlighted[file.path] || highlighting.has(file.path)) return;
    const abort = new AbortController();
    highlighting.set(file.path, abort);
    const result = await comparisonTokens(comparison, file.path, file.oldPath ?? file.path, abort.signal);
    if (!abort.signal.aborted) highlighted = { ...highlighted, [file.path]: result };
    if (highlighting.get(file.path) === abort) highlighting.delete(file.path);
  }
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

  const parsedFiles = $derived(
    files.map((file: DiffFile) => {
      const reason = collapseReason(file);
      const expanded = !reason || expandedFiles[file.path] === true;
      const patch = loadedPatches[file.path] ?? file.patch;
      return {
        ...file,
        patch,
        reason,
        expanded,
        loading: loadingFiles[file.path] === true,
        failed: failedFiles[file.path] === true,
        lines: expanded ? parsePatchLines(patch) : []
      };
    })
  );
  const additions = $derived(files.reduce((total: number, file: DiffFile) => total + file.additions, 0));
  const deletions = $derived(files.reduce((total: number, file: DiffFile) => total + file.deletions, 0));
  const matchingFiles = $derived(
    parsedFiles.filter((file: DiffFile) => file.path.toLowerCase().includes(fileQuery.trim().toLowerCase()))
  );
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
    if (drag && drag.path === path && drag.side === line.side && line.line !== null) drag.current = line.line;
  }
  function finishRange() {
    if (!drag) return;
    draft = {
      path: drag.path,
      side: drag.side,
      startLine: Math.min(drag.anchor, drag.current),
      line: Math.max(drag.anchor, drag.current)
    };
    drag = null;
  }
  function selected(path: string, line: PatchLine) {
    const range =
      drag?.path === path && drag.side === line.side
        ? { startLine: Math.min(drag.anchor, drag.current), line: Math.max(drag.anchor, drag.current), side: drag.side }
        : draft?.path === path
          ? draft
          : null;
    return Boolean(
      range && line.side === range.side && line.line !== null && line.line >= range.startLine && line.line <= range.line
    );
  }
  function threadsAt(path: string, line: PatchLine) {
    return threadIndex[`${path}:${line.side}:${line.line}`] ?? [];
  }
  function draftAt(path: string, line: PatchLine) {
    return draft?.path === path && draft.side === line.side && draft.line === line.line ? draft : null;
  }
  function fileAnchor(index: number) {
    return `changed-file-${index + 1}`;
  }
  function visible(node: HTMLElement, load: () => void) {
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer.disconnect();
        load();
      },
      { rootMargin: '800px 0px' }
    );
    observer.observe(node);
    return { destroy: () => observer.disconnect() };
  }
  function highlightVisible(node: HTMLElement, file: (typeof parsedFiles)[number]) {
    let current = file;
    let near = false;
    const observer = new IntersectionObserver(
      (entries) => {
        near = entries.some((entry) => entry.isIntersecting);
        if (near && current.expanded) void colorFile(current);
        else if (!near) {
          highlighting.get(current.path)?.abort();
          highlighting.delete(current.path);
          const next = { ...highlighted };
          delete next[current.path];
          highlighted = next;
        }
      },
      { rootMargin: '300px 0px' }
    );
    observer.observe(node);
    return {
      update(file: (typeof parsedFiles)[number]) {
        current = file;
        if (near && file.expanded) void colorFile(file);
      },
      destroy() {
        observer.disconnect();
        highlighting.get(current.path)?.abort();
      }
    };
  }
  function goToFile(file: (typeof parsedFiles)[number]) {
    const index = parsedFiles.indexOf(file);
    document.getElementById(fileAnchor(index))?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    navigatorOpen = false;
    fileQuery = '';
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
    void colorFile(file);
  }
  async function submit() {
    if (!draft || !body.trim()) return;
    await onCreate(draft, body);
    draft = null;
    body = '';
  }
</script>

<svelte:window onpointerup={finishRange} />

<div class="min-w-0">
  <div class="sticky top-13 z-8 mb-3 flex min-h-12 items-center justify-between gap-3 bg-canvas px-0.5">
    <div class="flex items-center gap-2 text-sm text-ink-muted">
      <Files size={16} /><strong class="font-semibold text-ink-strong"
        >{files.length} changed {files.length === 1 ? 'file' : 'files'}</strong
      ><DiffStat {additions} {deletions} class="ml-1 max-sm:hidden" />
    </div>
    {#if files.length > 1}
      <div class="relative" use:dismissable={() => (navigatorOpen = false)}>
        <Button size="small" aria-expanded={navigatorOpen} onclick={() => (navigatorOpen = !navigatorOpen)}
          >Jump to file <ChevronDown size={14} /></Button
        >
        {#if navigatorOpen}
          <div
            class="absolute top-[calc(100%+6px)] right-0 z-80 w-[min(440px,calc(100vw-32px))] origin-top-right overflow-hidden popover p-1.5"
            transition:popoverMotion
          >
            <SearchField
              bind:value={fileQuery}
              label="Find a changed file"
              class="mb-1.5 border-transparent font-mono"
            />
            <div class="grid max-h-80 gap-0.5 overflow-auto">
              {#each matchingFiles as file (file.path)}
                <button
                  type="button"
                  class="flex min-h-10 w-full items-center justify-between gap-3 rounded-lg px-2.5 py-2 text-left text-sm transition-colors hover:bg-surface-hover"
                  onclick={() => goToFile(file)}
                  ><span class="truncate font-mono text-xs text-ink">{file.path}</span><DiffStat
                    additions={file.additions}
                    deletions={file.deletions}
                  /></button
                >
              {:else}<p class="px-2 py-5 text-center text-sm text-ink-muted">No matching files</p>{/each}
            </div>
          </div>
        {/if}
      </div>
    {/if}
  </div>
  <div class="grid min-w-0 gap-4">
    {#each parsedFiles as file, index (file.path)}
      <section
        class="scroll-mt-30 overflow-hidden rounded-xl bg-surface shadow-surface outline-offset-2 [contain-intrinsic-size:auto_520px] [content-visibility:auto] focus-visible:outline-2 focus-visible:outline-brand"
        id={fileAnchor(index)}
        data-review-file
        tabindex="-1"
        use:highlightVisible={file}
        use:visible={() => {
          if (file.reason === 'lazy') void expandFile(file);
        }}
      >
        <header class="flex min-h-11 items-center gap-2.5 bg-surface-muted px-3">
          <strong class="truncate font-mono text-xs font-semibold text-ink-strong">{file.path}</strong>
          <span class="rounded bg-canvas px-1.5 py-0.5 text-2xs text-ink-muted capitalize max-sm:hidden"
            >{file.status}</span
          >
          <DiffStat additions={file.additions} deletions={file.deletions} class="ml-auto" />
          {#if file.reason && file.expanded}<Button
              icon
              size="small"
              variant="ghost"
              aria-label="Collapse {file.path}"
              title="Collapse file"
              onclick={() => (expandedFiles[file.path] = false)}><ChevronUp size={15} /></Button
            >{/if}
        </header>
        <div class="overflow-auto border-t border-line-subtle">
          {#if !file.expanded}
            <div class="flex min-h-19 items-center gap-3 px-4 py-3 text-ink-muted max-sm:items-start">
              <FileWarning size={18} class="shrink-0" />
              <div class="min-w-0">
                <strong class="block text-sm font-semibold text-ink"
                  >{file.reason === 'deleted'
                    ? 'Deleted file hidden'
                    : file.reason === 'large'
                      ? 'Large diff hidden'
                      : 'Loading diff'}</strong
                >
                <p class="mt-0.5 text-xs">
                  {file.failed
                    ? 'The file diff could not be loaded. Try again.'
                    : file.reason === 'deleted'
                      ? 'Expand this file to inspect its previous contents.'
                      : file.reason === 'large'
                        ? `This diff changes ${(file.additions + file.deletions).toLocaleString()} lines and is collapsed to keep the page responsive.`
                        : 'The patch loads when this file approaches the viewport.'}
                </p>
              </div>
              <Button size="small" class="ml-auto" loading={file.loading} onclick={() => expandFile(file)}
                >{file.failed ? 'Try again' : file.reason === 'deleted' ? 'Show deleted file' : 'Load diff'}</Button
              >
            </div>
          {:else}
            {#if file.lines.length === 0}<div class="px-4 py-7 text-center text-sm text-ink-muted">
                No textual diff is available for this file.
              </div>{/if}
            {#each file.lines as line (`${file.path}:${line.key}`)}
              {@const isSelected = selected(file.path, line)}
              <div
                class={[
                  'group grid min-h-6 grid-cols-[56px_minmax(max-content,1fr)]',
                  line.kind === 'added' && 'bg-success-soft text-success',
                  line.kind === 'removed' && 'bg-danger-soft text-danger',
                  line.kind === 'hunk' && 'bg-surface-muted text-ink-muted',
                  line.kind === 'context' && 'text-ink',
                  isSelected && 'bg-brand-soft!'
                ]}
                role="group"
                onpointerenter={() => extendRange(file.path, line)}
              >
                <div
                  class={[
                    'relative flex items-center justify-end pr-2.5 font-mono text-2xs text-ink-faint select-none',
                    line.kind === 'context' && 'bg-surface-muted',
                    isSelected && 'shadow-[inset_3px_0_var(--color-brand)]'
                  ]}
                >
                  {#if line.line !== null}<span>{line.line}</span>{#if reviewable}<Button
                        class="absolute left-1 size-6! min-h-0 cursor-crosshair p-0 opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-100"
                        icon
                        size="small"
                        variant="primary"
                        aria-label="Comment on line {line.line}; drag to select a range"
                        onpointerdown={(event) => beginRange(event, file.path, line)}
                        onclick={(event) => {
                          if (event.detail === 0) openSingle(file.path, line);
                        }}><MessageSquarePlus size={14} /></Button
                      >{/if}{/if}
                </div>
                <pre
                  class="m-0 px-2.5 font-mono text-xs leading-6 whitespace-pre">{#if line.side && line.line !== null}{line.text.slice(
                      0,
                      1
                    )}<Tokens
                      tokens={highlighted[file.path]?.[line.side as 'old' | 'new']?.[line.line - 1]}
                      text={line.text.slice(1) || ' '}
                    />{:else}{line.text || ' '}{/if}</pre>
              </div>
              {#each threadsAt(file.path, line) as thread (thread.id)}<ReviewThread
                  {thread}
                  {busy}
                  {context}
                  {canResolve}
                  {canModerate}
                  {viewerId}
                  inline
                  interactive={reviewable}
                  {onReply}
                  {onResolve}
                  {onEdit}
                  {onDelete}
                />{/each}
              {@const activeDraft = draftAt(file.path, line)}
              {#if activeDraft}
                <div class="border-y border-line bg-surface-raised py-3 pr-3 pl-3 sm:pl-17">
                  <div class="mb-2 text-xs text-ink-muted">
                    Commenting on {activeDraft.startLine === activeDraft.line
                      ? `line ${activeDraft.line}`
                      : `lines ${activeDraft.startLine}–${activeDraft.line}`}
                  </div>
                  <CommentComposer
                    bind:value={body}
                    {context}
                    placeholder="Leave a review comment"
                    submitLabel="Add review comment"
                    minHeight={92}
                    {busy}
                    onSubmit={submit}
                    onCancel={() => {
                      draft = null;
                      body = '';
                    }}
                  />
                </div>
              {/if}
            {/each}
          {/if}
        </div>
      </section>
    {/each}
  </div>
</div>
