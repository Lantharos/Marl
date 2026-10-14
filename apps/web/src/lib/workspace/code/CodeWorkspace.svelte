<script lang="ts">
  import { onMount, type Snippet } from 'svelte';
  import { afterNavigate, goto } from '$app/navigation';
  import { page } from '$app/state';
  import type { ReleaseSummary } from '@marl/contracts';
  import ExternalLink from '@lucide/svelte/icons/external-link';
  import PanelRight from '@lucide/svelte/icons/panel-right';
  import Search from '@lucide/svelte/icons/search';
  import FileFinder from '#lib/repositories/browser/FileFinder.svelte';
  import { treeHref } from '#lib/repositories/browser/entry-path.js';
  import { CodeBrowser } from '#lib/repositories/browser/tree/code-browser.svelte.js';
  import { PaneLayout } from '#lib/repositories/browser/tree/pane-layout.svelte.js';
  import type { BranchSummary } from '#lib/repositories/browser/types.js';
  import { plainKey } from '#lib/ui/keyboard.js';
  import CanvasFrame from '../canvas/CanvasFrame.svelte';
  import Panes from '../shell/Panes.svelte';
  import { shell } from '../shell/shell-state.svelte';
  import { repositoryHref } from '../store/refs';
  import CodeCrumbs from './CodeCrumbs.svelte';
  import CodeInspector from './CodeInspector.svelte';
  import { workspaceLinks, type CodeRepository } from './code-repository';
  import CodeTreePane from './CodeTreePane.svelte';

  let {
    repository,
    branches,
    latestRelease,
    signedIn,
    children
  }: {
    repository: CodeRepository;
    branches: BranchSummary[];
    latestRelease: Promise<ReleaseSummary | null>;
    signedIn: boolean;
    children: Snippet;
  } = $props();
  const code = new CodeBrowser(() => repository);
  const tree = $derived(code.tree);
  const browsable = $derived(branches.length > 0);
  const pane = new PaneLayout();
  let canvas = $state<HTMLElement>();
  let finderOpen = $state(false);
  let showTree = $state(false);
  const classicHref = $derived(
    page.url.pathname === repositoryHref(`${repository.owner}/${repository.name}`)
      ? treeHref(tree.location)
      : page.url.pathname.slice('/next'.length)
  );

  onMount(() => pane.restore());

  afterNavigate(({ to }) => {
    if (code.file) showTree = false;
    if (canvas && !to?.url.hash) canvas.scrollTop = 0;
  });

  shell.provideActions(() => [
    ...(browsable
      ? [{ id: 'find-file', label: 'Go to file', keys: 'T', icon: Search, run: () => (finderOpen = true) }]
      : []),
    { id: 'details', label: 'Show or hide details', keys: ']', icon: PanelRight, run: shell.toggleInspector },
    { id: 'classic', label: 'Open in the classic view', icon: ExternalLink, run: () => goto(classicHref) }
  ]);

  function keydown(event: KeyboardEvent) {
    if (!browsable || finderOpen || plainKey(event) !== 't') return;
    event.preventDefault();
    finderOpen = true;
  }
</script>

<svelte:window onkeydown={keydown} />

{#snippet list()}
  <CodeTreePane {tree} current={code.current} layout={pane} onFind={() => (finderOpen = true)} />
{/snippet}

{#snippet crumbs()}
  <CodeCrumbs location={tree.location} path={page.params.path ?? ''} />
{/snippet}

{#snippet canvasPane()}
  <CanvasFrame
    bind:element={canvas}
    {crumbs}
    backLabel="Show files"
    onBack={browsable ? () => (showTree = true) : undefined}
  >
    <div class="px-4 pb-16 sm:px-6">{@render children()}</div>
  </CanvasFrame>
{/snippet}

{#snippet inspector()}
  <CodeInspector {repository} location={tree.location} {branches} entry={code.entry} {latestRelease} {signedIn} />
{/snippet}

<Panes
  list={browsable ? list : undefined}
  canvas={canvasPane}
  {inspector}
  listLabel="Files"
  listWidth={pane.width}
  mobileView={showTree ? 'list' : 'canvas'}
/>

{#if finderOpen}<FileFinder
    location={tree.location}
    initial={tree.entries(code.openFolder) ?? []}
    links={workspaceLinks}
    onClose={() => (finderOpen = false)}
  />{/if}
