<script lang="ts">
  import { afterNavigate, goto } from '$app/navigation';
  import { untrack } from 'svelte';
  import ArrowDown from '@lucide/svelte/icons/arrow-down';
  import ArrowUp from '@lucide/svelte/icons/arrow-up';
  import BadgeCheck from '@lucide/svelte/icons/badge-check';
  import CircleCheck from '@lucide/svelte/icons/circle-check';
  import Files from '@lucide/svelte/icons/files';
  import FileDiff from '@lucide/svelte/icons/file-diff';
  import LogOut from '@lucide/svelte/icons/log-out';
  import MessageSquare from '@lucide/svelte/icons/message-square';
  import Button from '#lib/components/controls/Button.svelte';
  import Notice from '#lib/components/feedback/Notice.svelte';
  import Spinner from '#lib/components/feedback/Spinner.svelte';
  import Kbd from '#lib/components/page/Kbd.svelte';
  import type { PatchLine } from '#lib/code/diff.js';
  import { plainKey } from '#lib/ui/keyboard.js';
  import { shell } from '../shell/shell-state.svelte';
  import { itemHref, type ItemRef } from '../store/refs';
  import { workspace } from '../store/workspace.svelte';
  import { Discussion } from '../discussion/discussion.svelte';
  import RemovalDialog from '../discussion/RemovalDialog.svelte';
  import ConversationPane from './ConversationPane.svelte';
  import { DiffCursor } from './diff-cursor.svelte';
  import DiffPane from './DiffPane.svelte';
  import FileTree from './FileTree.svelte';
  import { reviewSession } from './review-session.svelte';
  import RevisionBar from './RevisionBar.svelte';

  let { ref, viewerId }: { ref: ItemRef; viewerId: string } = $props();
  const entry = $derived(workspace.pull(ref));
  const session = $derived(entry.state ? reviewSession(entry) : null);
  const file = $derived(session?.selectedFile ?? null);
  const lines = $derived.by(() => {
    const patch = file && session?.patch(file);
    return patch && 'lines' in patch ? patch.lines : [];
  });
  const cursor = new DiffCursor(() => lines);
  const discussion = $derived(session ? new Discussion(session.pageState, viewerId) : null);
  let panel = $state<'files' | 'diff' | 'conversation'>('diff');
  let composer = $state<HTMLElement>();
  let returnTo = $state<string | null>(null);

  afterNavigate(({ from }) => {
    const url = from?.url;
    if (url?.pathname.startsWith('/next') && !url.pathname.endsWith('/review'))
      returnTo = `${url.pathname}${url.search}`;
  });

  $effect(() => void entry.load());
  $effect(() => {
    if (entry.state) return entry.live();
  });
  $effect(() => void session?.loadDiff());
  $effect(() => {
    void lines;
    untrack(() => cursor.reset());
  });
  $effect(() => {
    const focus = session?.focus;
    if (!session || !focus || file?.path !== focus.path) return;
    const index = lines.findIndex((line) => line.side === focus.side && line.line === focus.line);
    if (index < 0) return;
    untrack(() => {
      cursor.place(index);
      session.focus = null;
      panel = 'diff';
    });
  });
  $effect(() => {
    if (!session || !file) return;
    const next = session.files.find(
      (candidate) => candidate.path === session.order[session.order.indexOf(file.path) + 1]
    );
    untrack(() => {
      void session.loadPatch(file);
      void session.highlight(file);
      if (next) void session.loadPatch(next);
    });
  });

  function leave() {
    void goto(returnTo ?? itemHref(ref));
  }

  function threaded(line: PatchLine) {
    return Boolean(file && line.side && session?.threads.has(`${file.path}:${line.side}:${line.line}`));
  }

  function approve() {
    if (!session?.pageState.reviewable) return;
    session.outcome = 'approved';
    composer?.querySelector('textarea')?.focus();
  }

  function comment() {
    if (session?.canComment && file) cursor.open(file.path, !session.base);
  }

  shell.provideActions(() =>
    session
      ? [
          { id: 'next-file', label: 'Next file', keys: 'N', icon: ArrowDown, run: () => session.stepFile(1) },
          { id: 'previous-file', label: 'Previous file', keys: 'P', icon: ArrowUp, run: () => session.stepFile(-1) },
          ...(file
            ? [
                {
                  id: 'viewed',
                  label: session.isViewed(file.path) ? 'Mark file not viewed' : 'Mark file viewed',
                  keys: 'V',
                  icon: CircleCheck,
                  run: () => session.toggleViewed(file.path)
                }
              ]
            : []),
          ...(session.pageState.reviewable
            ? [{ id: 'approve', label: 'Approve', keys: 'A', icon: BadgeCheck, run: approve }]
            : []),
          { id: 'leave', label: 'Leave review', keys: 'Esc', icon: LogOut, run: leave }
        ]
      : []
  );

  function escape(event: KeyboardEvent) {
    const target = event.target as HTMLElement | null;
    if (target?.closest('dialog, [popover]')) return;
    event.preventDefault();
    if (target?.closest('input, textarea')) target.blur();
    else if (cursor.draft) cursor.close();
    else leave();
  }

  function keydown(event: KeyboardEvent) {
    if (!session || event.defaultPrevented) return;
    if (event.key === 'Escape') return escape(event);
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey) && session.pageState.reviewable) {
      event.preventDefault();
      void session.submit();
      return;
    }
    const key = plainKey(event);
    if (key === 'n' || key === 'p') session.stepFile(key === 'n' ? 1 : -1);
    else if (key === 'j' || key === 'k') cursor.jump(key === 'j' ? 1 : -1, threaded);
    else if (key === 'ArrowDown' || key === 'ArrowUp') cursor.move(key === 'ArrowDown' ? 1 : -1, event.shiftKey);
    else if (key === 'c') comment();
    else if (key === 'v' && file) session.toggleViewed(file.path);
    else if (key === 'a') approve();
    else return;
    event.preventDefault();
  }
</script>

<svelte:window onkeydown={keydown} />

<div class="review flex h-full min-h-0 flex-col">
  {#if entry.error}
    <div class="p-6"><Notice>{entry.error}</Notice></div>
  {:else if !session}
    <div class="flex items-center gap-2 p-8 text-sm text-ink-muted" role="status"><Spinner />Loading</div>
  {:else}
    <RevisionBar {session}>
      {#snippet actions()}
        <div class="flex gap-0.5 lg:hidden" role="group" aria-label="Panels">
          <Button
            icon
            size="small"
            variant="ghost"
            aria-label="Files"
            class="aria-pressed:bg-surface-muted aria-pressed:text-ink-strong"
            aria-pressed={panel === 'files'}
            onclick={() => (panel = 'files')}><Files size={15} /></Button
          >
          <Button
            icon
            size="small"
            variant="ghost"
            aria-label="Changes"
            class="aria-pressed:bg-surface-muted aria-pressed:text-ink-strong"
            aria-pressed={panel === 'diff'}
            onclick={() => (panel = 'diff')}><FileDiff size={15} /></Button
          >
          <Button
            icon
            size="small"
            variant="ghost"
            aria-label="Conversation"
            class="aria-pressed:bg-surface-muted aria-pressed:text-ink-strong"
            aria-pressed={panel === 'conversation'}
            onclick={() => (panel = 'conversation')}><MessageSquare size={15} /></Button
          >
        </div>
        <Button size="small" variant="ghost" onclick={leave}>Done <Kbd class="max-sm:hidden">Esc</Kbd></Button>
      {/snippet}
    </RevisionBar>
    <div class="grid min-h-0 flex-1 lg:grid-cols-[240px_minmax(0,1fr)_360px] xl:grid-cols-[280px_minmax(0,1fr)_420px]">
      <aside
        class={['min-h-0 border-line-subtle lg:border-r', panel !== 'files' && 'max-lg:hidden']}
        aria-label="Files"
      >
        <FileTree {session} onPick={() => (panel = 'diff')} />
      </aside>
      <section class={['min-h-0 min-w-0', panel !== 'diff' && 'max-lg:hidden']} aria-label="Changes">
        {#if discussion}<DiffPane {session} {cursor} {discussion} />{/if}
      </section>
      <aside
        class={['min-h-0 border-line-subtle lg:border-l', panel !== 'conversation' && 'max-lg:hidden']}
        aria-label="Conversation"
      >
        {#if discussion}<ConversationPane {session} {discussion} bind:composer />{/if}
      </aside>
    </div>
    {#if discussion}<RemovalDialog {discussion} />{/if}
  {/if}
</div>

<style>
  .review {
    animation: enter 200ms var(--ease-standard);
  }

  @keyframes enter {
    from {
      opacity: 0;
      transform: translateY(6px);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .review {
      animation: none;
    }
  }
</style>
