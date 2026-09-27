<script lang="ts">
  import { page } from '$app/state';
  import { tick } from 'svelte';
  import type { PullRequestDetail } from '@marl/contracts';
  import CircleCheck from '@lucide/svelte/icons/circle-check';
  import FileDiff from '@lucide/svelte/icons/file-diff';
  import GitCommitHorizontal from '@lucide/svelte/icons/git-commit-horizontal';
  import MessageSquare from '@lucide/svelte/icons/message-square';
  import X from '@lucide/svelte/icons/x';
  import Button from '$lib/components/controls/Button.svelte';
  import Chip from '$lib/components/controls/Chip.svelte';
  import Seo from '$lib/components/page/Seo.svelte';
  import { seoExcerpt } from '$lib/seo';
  import { plainKey, stepThrough } from '$lib/ui/keyboard';
  import { connectPullLive } from '../pull-live';
  import PullLifecycleActions from '../PullLifecycleActions.svelte';
  import { PullMergeability } from '../PullMergeability.svelte';
  import PullSummary from '../PullSummary.svelte';
  import { PullPageState, type PullTab } from './pull-page-state.svelte';
  import PullChanges from './PullChanges.svelte';
  import PullChecks from './PullChecks.svelte';
  import PullCommits from './PullCommits.svelte';
  import PullDetailsEditor from './PullDetailsEditor.svelte';
  import PullOverview from './PullOverview.svelte';

  let {
    pull: source,
    viewerId,
    publicRepository
  }: { pull: PullRequestDetail; viewerId?: string; publicRepository: boolean } = $props();
  const route = { owner: page.params.owner ?? '', repo: page.params.repo ?? '', number: Number(page.params.number) };
  const pageState = new PullPageState(route, () => source);
  const mergeability = new PullMergeability();
  const context = { owner: route.owner, repository: route.repo };
  const pull = $derived(pageState.pull);
  let editing = $state(false);
  let changesView = $state<HTMLElement>();

  $effect(() => {
    if (!['draft', 'merged', 'closed'].includes(pull.state))
      return mergeability.check(pageState.endpoint, pull.targetCommitId, pull.sourceCommitId);
  });

  $effect(() =>
    connectPullLive({
      path: `/api/v1/repositories/${encodeURIComponent(route.owner)}/${encodeURIComponent(route.repo)}/pulls/${route.number}/live`,
      onUpdate: pageState.applyUpdate,
      catchUp: pageState.catchUp
    })
  );

  async function selectTab(next: PullTab) {
    const focusChanges = next === 'changes' && pageState.tab !== 'changes';
    pageState.tab = next;
    if (next === 'changes') void pageState.loadDiff();
    if (!focusChanges) return;
    await tick();
    changesView?.scrollIntoView({
      behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
      block: 'start'
    });
  }

  const tabOrder: PullTab[] = ['overview', 'changes', 'commits', 'checks'];

  async function shortcut(event: KeyboardEvent) {
    const key = plainKey(event);
    if (!key) return;
    const tabIndex = Number(key) - 1;
    if (tabOrder[tabIndex]) void selectTab(tabOrder[tabIndex]);
    else if ((key === 'j' || key === 'k') && pageState.tab === 'changes')
      stepThrough('[data-review-file]', key === 'j' ? 1 : -1);
    else if (key === 'n' || key === 'p') stepThrough('[data-review-thread="open"]', key === 'n' ? 1 : -1);
    else if (key === 'r' && pageState.reviewable) {
      if (pageState.tab !== 'changes') await selectTab('changes');
      pageState.reviewOpen = true;
    } else if (key === 'c' && viewerId) {
      if (pageState.tab !== 'overview') await selectTab('overview');
      await tick();
      document.querySelector<HTMLTextAreaElement>('[data-pull-composer] textarea')?.focus();
    } else return;
    event.preventDefault();
  }

  const tabs = $derived([
    { id: 'overview' as const, label: 'Overview', icon: MessageSquare, count: null },
    { id: 'changes' as const, label: 'Changes', icon: FileDiff, count: pageState.diff?.files.length ?? null },
    { id: 'commits' as const, label: 'Commits', icon: GitCommitHorizontal, count: pull.commits.length },
    { id: 'checks' as const, label: 'Checks', icon: CircleCheck, count: pull.checks.length }
  ]);
</script>

<svelte:window onkeydown={shortcut} />
<Seo
  title={`${pull.title} · !${route.number} · ${route.owner}/${route.repo} · Marl`}
  description={seoExcerpt(pull.bodyText, `${pull.title} — proposed changes for ${route.owner}/${route.repo}.`)}
  path={page.url.pathname}
  robots={publicRepository ? 'index, follow' : 'noindex, nofollow'}
/>

<div
  class={[
    'grid items-start gap-7 lg:gap-8',
    pageState.tab === 'changes'
      ? 'lg:grid-cols-[minmax(280px,0.7fr)_minmax(0,2fr)] xl:grid-cols-[300px_minmax(0,1fr)]'
      : 'lg:grid-cols-[minmax(300px,0.85fr)_minmax(0,1.75fr)]'
  ]}
>
  <PullSummary
    conflicted={mergeability.conflicted}
    {pull}
    busy={pageState.busy}
    {context}
    onEdit={() => (editing = true)}
    onUpdate={pageState.updateMetadata}
    onCreateLabel={pageState.createLabel}
  >
    {#snippet actions()}{#key pull.sourceCommitId}<PullLifecycleActions
          conflicted={mergeability.conflicted}
          {pull}
          busy={pageState.busy}
          approvingChecks={pageState.approvingChecks}
          bind:mergeMethod={pageState.mergeMethod}
          onAction={pageState.act}
          onApproveChecks={pageState.approveChecks}
        />{/key}{/snippet}
  </PullSummary>

  <div class="min-w-0" bind:this={changesView}>
    <nav class="mb-4 flex gap-1.5 overflow-x-auto pb-0.5 max-sm:-mx-4 max-sm:px-4" aria-label="Pull sections">
      {#each tabs as { id, label, icon: Icon, count } (id)}
        <Chip active={pageState.tab === id} onclick={() => selectTab(id)}
          ><Icon size={14} />{label}{#if count !== null}<span class="text-xs text-ink-muted tabular-nums">{count}</span
            >{/if}</Chip
        >
      {/each}
    </nav>
    {#if pageState.error}
      <div
        class="mb-4 flex items-center gap-2 rounded-lg bg-danger-soft py-1.5 pr-1.5 pl-3 text-sm text-danger"
        role="alert"
      >
        <span class="flex-1">{pageState.error}</span>
        <Button icon size="small" variant="ghost" aria-label="Dismiss error" onclick={() => (pageState.error = '')}
          ><X size={14} /></Button
        >
      </div>
    {/if}
    {#if pageState.revisionNotice}
      <div
        class="mb-4 flex items-center gap-2 rounded-lg bg-brand-soft py-1.5 pr-1.5 pl-3 text-sm text-brand"
        role="status"
      >
        <GitCommitHorizontal size={15} class="shrink-0" /><span class="flex-1"
          >A new revision arrived. Review it before submitting.</span
        >
        <Button
          icon
          size="small"
          variant="ghost"
          aria-label="Dismiss revision update"
          onclick={() => (pageState.revisionNotice = false)}><X size={14} /></Button
        >
      </div>
    {/if}

    {#if pageState.tab === 'overview'}
      <PullOverview {pageState} {viewerId} signedIn={Boolean(viewerId)} {context} />
    {:else if pageState.tab === 'changes'}
      <PullChanges {pageState} {viewerId} {context} />
    {:else if pageState.tab === 'commits'}
      <PullCommits
        commits={pull.commits}
        repository={`${pull.sourceRepository?.owner ?? route.owner}/${pull.sourceRepository?.name ?? route.repo}`}
      />
    {:else}
      <PullChecks {pull} approving={pageState.approvingChecks} onApprove={pageState.approveChecks} />
    {/if}
  </div>
</div>

<PullDetailsEditor
  open={editing}
  title={pull.title}
  body={pull.body}
  {context}
  busy={pageState.busy}
  onSave={pageState.saveDetails}
  onClose={() => (editing = false)}
/>
