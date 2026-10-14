<script lang="ts">
  import { goto } from '$app/navigation';
  import type { Snippet } from 'svelte';
  import ExternalLink from '@lucide/svelte/icons/external-link';
  import FileDiff from '@lucide/svelte/icons/file-diff';
  import PanelRight from '@lucide/svelte/icons/panel-right';
  import Notice from '#lib/components/feedback/Notice.svelte';
  import Spinner from '#lib/components/feedback/Spinner.svelte';
  import { plainKey } from '#lib/ui/keyboard.js';
  import IssueInspector from '../inspector/IssueInspector.svelte';
  import PullInspector from '../inspector/PullInspector.svelte';
  import Panes from '../shell/Panes.svelte';
  import { shell, type ShellAction } from '../shell/shell-state.svelte';
  import { reviewHref, type ItemRef } from '../store/refs';
  import { workspace } from '../store/workspace.svelte';
  import CanvasFrame from './CanvasFrame.svelte';
  import IssueCanvas from './IssueCanvas.svelte';
  import PullCanvas from './PullCanvas.svelte';

  let {
    ref,
    viewerId,
    list,
    empty,
    mobileView = 'canvas',
    canvasElement = $bindable(),
    actions = [],
    onBack
  }: {
    ref: ItemRef | null;
    viewerId: string;
    list?: Snippet;
    empty?: Snippet;
    mobileView?: 'list' | 'canvas';
    canvasElement?: HTMLElement;
    actions?: ShellAction[];
    onBack?: () => void;
  } = $props();
  const entry = $derived(ref && workspace.entry(ref));
  const reviewable = $derived(
    entry?.kind === 'pull' && entry.state && ['open', 'mergeable', 'blocked'].includes(entry.state.pull.state)
  );

  $effect(() => void entry?.load());

  $effect.pre(() => {
    void entry;
    if (canvasElement) canvasElement.scrollTop = 0;
  });

  $effect(() => {
    if (entry?.kind === 'pull' && entry.state) return entry.live();
  });

  shell.provideActions(() => [
    ...actions,
    ...(ref && reviewable
      ? [{ id: 'review', label: 'Review changes', keys: 'R', icon: FileDiff, run: () => goto(reviewHref(ref)) }]
      : []),
    ...(ref
      ? [
          { id: 'details', label: 'Show or hide details', keys: ']', icon: PanelRight, run: shell.toggleInspector },
          {
            id: 'classic',
            label: 'Open in the classic view',
            icon: ExternalLink,
            run: () => goto(`/${ref.owner}/${ref.repo}/${ref.kind === 'pull' ? 'pulls' : 'issues'}/${ref.number}`)
          }
        ]
      : [])
  ]);

  function keydown(event: KeyboardEvent) {
    if (plainKey(event) !== 'r' || !ref || !reviewable) return;
    event.preventDefault();
    void goto(reviewHref(ref));
  }
</script>

<svelte:window onkeydown={keydown} />

{#snippet canvas()}
  <CanvasFrame {ref} bind:element={canvasElement} details={Boolean(entry?.state)} {onBack}>
    {#if !entry}
      {@render empty?.()}
    {:else if entry.error}
      <div class="mx-auto max-w-184 px-4 pt-6 sm:px-8"><Notice>{entry.error}</Notice></div>
    {:else if !entry.state}
      <div class="flex items-center gap-2 px-8 pt-10 text-sm text-ink-muted" role="status"><Spinner />Loading</div>
    {:else}
      {#key entry}
        {#if entry.kind === 'pull'}<PullCanvas pageState={entry.state} {viewerId} />{:else}<IssueCanvas
            pageState={entry.state}
            {viewerId}
          />{/if}
      {/key}
    {/if}
  </CanvasFrame>
{/snippet}

{#snippet details()}
  {#if entry?.kind === 'pull' && entry.state}
    <PullInspector {entry} />
  {:else if entry?.kind === 'issue' && entry.state}
    <IssueInspector pageState={entry.state} {viewerId} />
  {/if}
{/snippet}

<Panes {list} {mobileView} {canvas} inspector={entry?.state ? details : undefined} />
