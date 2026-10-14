<script lang="ts">
  import { tick } from 'svelte';
  import Circle from '@lucide/svelte/icons/circle';
  import CircleCheck from '@lucide/svelte/icons/circle-check';
  import MessageSquarePlus from '@lucide/svelte/icons/message-square-plus';
  import type { PatchLine } from '#lib/code/diff.js';
  import DiffStat from '#lib/code/DiffStat.svelte';
  import Tokens from '#lib/code/Tokens.svelte';
  import Button from '#lib/components/controls/Button.svelte';
  import Notice from '#lib/components/feedback/Notice.svelte';
  import Spinner from '#lib/components/feedback/Spinner.svelte';
  import MarkdownComposer from '#lib/components/markdown/MarkdownComposer.svelte';
  import Kbd from '#lib/components/page/Kbd.svelte';
  import type { Discussion } from '../discussion/discussion.svelte';
  import Thread from '../discussion/Thread.svelte';
  import type { DiffCursor } from './diff-cursor.svelte';
  import type { ReviewSession } from './review-session.svelte';

  let { session, cursor, discussion }: { session: ReviewSession; cursor: DiffCursor; discussion: Discussion } =
    $props();
  const file = $derived(session.selectedFile);
  const pageState = $derived(session.pageState);
  const pull = $derived(session.pull);
  const patch = $derived(file && session.patch(file));
  const tokens = $derived(file && session.tokens(file));
  const hunks = $derived.by(() => {
    const groups: { start: number; lines: PatchLine[] }[] = [];
    for (const [index, line] of cursor.lines.entries()) {
      if (line.kind === 'hunk' || !groups.length) groups.push({ start: index, lines: [] });
      groups.at(-1)!.lines.push(line);
    }
    return groups;
  });
  const position = $derived(file ? session.order.indexOf(file.path) + 1 : 0);
  let viewport = $state<HTMLElement>();
  let width = $state(0);
  let composer = $state<HTMLElement>();

  $effect(() => {
    if (cursor.index < 0) return;
    viewport?.querySelector(`[data-line="${cursor.index}"]`)?.scrollIntoView({ block: 'nearest' });
  });

  $effect(() => {
    if (!cursor.draft) return;
    void tick().then(() => composer?.querySelector('textarea')?.focus());
  });

  function threadsAt(line: PatchLine) {
    return file && line.side && line.line !== null
      ? (session.threads.get(`${file.path}:${line.side}:${line.line}`) ?? [])
      : [];
  }

  function draftAt(line: PatchLine) {
    const draft = cursor.draft;
    return Boolean(draft && draft.side === line.side && draft.line === line.line && line.kind !== 'hunk');
  }

  function commentable(line: PatchLine) {
    return session.canComment && line.side !== null && (line.side === 'new' || !session.base);
  }

  function pick(event: PointerEvent) {
    const row = (event.target as Element).closest<HTMLElement>('[data-line]');
    if (row && !(event.target as Element).closest('button')) cursor.place(Number(row.dataset.line), event.shiftKey);
  }

  function startComment(index: number) {
    cursor.place(index);
    if (file) cursor.open(file.path, !session.base);
  }

  async function submitDraft() {
    const draft = cursor.draft;
    if (!draft) return;
    await pageState.createLineComment(draft, cursor.body);
    if (!pageState.error) cursor.close();
  }
</script>

<div class="flex h-full min-w-0 flex-col">
  {#if file}
    <header class="flex h-11 shrink-0 items-center gap-3 border-b border-line-subtle px-4">
      <strong class="min-w-0 truncate font-mono text-xs font-semibold text-ink-strong">{file.path}</strong>
      {#if file.oldPath && file.oldPath !== file.path}<span class="truncate font-mono text-xs text-ink-faint"
          >from {file.oldPath}</span
        >{/if}
      <span class="text-xs text-ink-muted capitalize max-sm:hidden">{file.status}</span>
      <DiffStat additions={file.additions} deletions={file.deletions} class="ml-auto" />
      <span class="text-xs text-ink-faint tabular-nums max-sm:hidden">{position} of {session.order.length}</span>
      <Button
        size="small"
        variant="ghost"
        aria-pressed={session.isViewed(file.path)}
        onclick={() => file && session.toggleViewed(file.path)}
        >{#if session.isViewed(file.path)}<CircleCheck size={14} class="text-success" />Viewed{:else}<Circle
            size={14}
          />Viewed{/if}<Kbd class="max-sm:hidden">V</Kbd></Button
      >
    </header>
  {/if}
  {#if pageState.error}<Notice class="mx-4 mt-3" ondismiss={() => (pageState.error = '')}>{pageState.error}</Notice
    >{/if}
  <div
    bind:this={viewport}
    bind:clientWidth={width}
    class="min-h-0 flex-1 overflow-auto overscroll-contain bg-surface"
    style:--pane-width="{width}px"
  >
    {#if session.error}
      <div class="p-4"><Notice>{session.error}</Notice></div>
    {:else if session.loading}
      <div class="flex items-center gap-2 p-6 text-sm text-ink-muted" role="status"><Spinner />Loading changes</div>
    {:else if !file}
      <p class="p-6 text-sm text-ink-muted">Nothing changed between these revisions.</p>
    {:else if !patch || 'loading' in patch}
      <div class="flex items-center gap-2 p-6 text-sm text-ink-muted" role="status"><Spinner />Loading file</div>
    {:else if 'error' in patch}
      <div class="flex items-center gap-3 p-4">
        <Notice class="flex-1">{patch.error}</Notice>
        <Button size="small" onclick={() => file && session.retryPatch(file)}>Try again</Button>
      </div>
    {:else if !cursor.lines.length}
      <p class="p-6 text-sm text-ink-muted">There is no text diff for this file.</p>
    {:else}
      <div
        class="min-w-full py-2 font-mono text-xs leading-6"
        aria-label="Changes in {file.path}"
        role="document"
        onpointerdown={pick}
      >
        {#each hunks as hunk (hunk.start)}
          <div
            class="w-max min-w-full [content-visibility:auto]"
            style:contain-intrinsic-block-size="auto {hunk.lines.length * 24}px"
          >
            {#each hunk.lines as line, offset (line.key)}
              {@const index = hunk.start + offset}
              {#if line.kind === 'hunk'}
                <div class="sticky left-0 w-(--pane-width) truncate px-4 pt-3 pb-1 text-ink-faint select-none">
                  {line.text}
                </div>
              {:else}
                {@const selected = cursor.selected(index)}
                <div
                  data-line={index}
                  class={[
                    'group grid min-h-6 grid-cols-[3.25rem_3.25rem_minmax(max-content,1fr)]',
                    line.kind === 'added' && 'bg-success-soft',
                    line.kind === 'removed' && 'bg-danger-soft',
                    selected && line.kind === 'context' && 'bg-surface-hover',
                    selected && cursor.anchor !== null && 'bg-brand-soft!'
                  ]}
                >
                  <span
                    class={[
                      'relative pr-2 text-right tabular-nums select-none',
                      selected ? 'bg-brand-soft text-brand-strong' : 'text-ink-faint'
                    ]}
                    >{line.oldLine ?? ''}{#if commentable(line)}<button
                        type="button"
                        class="absolute inset-y-0 left-1 my-auto grid size-5 place-items-center rounded-sm bg-brand text-on-brand opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                        aria-label="Comment on line {line.line}"
                        onclick={(event) => {
                          event.stopPropagation();
                          startComment(index);
                        }}><MessageSquarePlus size={12} /></button
                      >{/if}</span
                  >
                  <span
                    class={[
                      'pr-3 text-right tabular-nums select-none',
                      selected ? 'bg-brand-soft text-brand-strong' : 'text-ink-faint'
                    ]}>{line.newLine ?? ''}</span
                  >
                  <pre
                    class={[
                      'm-0 pr-6 font-[inherit] whitespace-pre',
                      line.kind === 'added' ? 'text-success' : line.kind === 'removed' ? 'text-danger' : 'text-ink'
                    ]}><span class="inline-block w-4 select-none">{line.text.slice(0, 1)}</span><Tokens
                      tokens={line.side && line.line !== null ? tokens?.[line.side][line.line - 1] : undefined}
                      text={line.text.slice(1)}
                    /></pre>
                </div>
                {#each threadsAt(line) as thread (thread.id)}
                  <div
                    class="sticky left-0 w-(--pane-width) max-w-200 py-1 font-sans text-base leading-normal"
                    data-thread-line={index}
                  >
                    <Thread {discussion} {thread} inline />
                  </div>
                {/each}
                {#if draftAt(line) && cursor.draft}
                  <div
                    bind:this={composer}
                    class="sticky left-0 w-(--pane-width) max-w-200 px-4 py-3 font-sans text-base leading-normal"
                  >
                    <p class="mb-2 text-xs text-ink-muted">
                      {cursor.draft.startLine === cursor.draft.line
                        ? `Line ${cursor.draft.line}`
                        : `Lines ${cursor.draft.startLine}–${cursor.draft.line}`}
                    </p>
                    <MarkdownComposer
                      bind:value={cursor.body}
                      variant="inline"
                      minHeight="64px"
                      placeholder="Comment on this line"
                      context={discussion.context}
                      disabled={pageState.busy}
                      onsubmit={submitDraft}
                    >
                      {#snippet actions()}
                        <Button size="small" variant="ghost" onclick={() => cursor.close()}>Cancel</Button>
                        <Button
                          size="small"
                          variant="primary"
                          loading={pageState.busy}
                          disabled={!cursor.body.trim()}
                          onclick={submitDraft}>Comment</Button
                        >
                      {/snippet}
                    </MarkdownComposer>
                  </div>
                {/if}
              {/if}
            {/each}
          </div>
        {/each}
      </div>
    {/if}
  </div>
</div>
