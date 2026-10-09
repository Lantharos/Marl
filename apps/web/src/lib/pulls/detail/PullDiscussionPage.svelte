<script lang="ts">
  import { afterNavigate } from '$app/navigation';
  import { page } from '$app/state';
  import { tick, untrack } from 'svelte';
  import type { PullRequestDetail } from '@marl/contracts';
  import CircleCheck from '@lucide/svelte/icons/circle-check';
  import FileDiff from '@lucide/svelte/icons/file-diff';
  import GitCommitHorizontal from '@lucide/svelte/icons/git-commit-horizontal';
  import MessageSquare from '@lucide/svelte/icons/message-square';
  import Notice from '#lib/components/feedback/Notice.svelte';
  import ChipLink from '#lib/components/controls/ChipLink.svelte';
  import Seo from '#lib/components/page/Seo.svelte';
  import { reporting } from '#lib/reporting/reporting.svelte.js';
  import { seoExcerpt } from '#lib/seo.js';
  import { plainKey, stepThrough } from '#lib/ui/keyboard.js';
  import { connectPullLive } from '../pull-live';
  import { PullMergeability } from '../PullMergeability.svelte';
  import PullOverview from '../overview/PullOverview.svelte';
  import PullLifecycleActions from '../summary/PullLifecycleActions.svelte';
  import PullStatus from '../summary/PullStatus.svelte';
  import PullSummary from '../summary/PullSummary.svelte';
  import { PullPageState, type PullTab } from './pull-page-state.svelte';
  import PullChanges from './PullChanges.svelte';
  import PullChecks from './PullChecks.svelte';
  import PullCommits from './PullCommits.svelte';
  import PullDetailsEditor from './PullDetailsEditor.svelte';

  let {
    route,
    pull: source,
    tab,
    viewerId,
    publicRepository
  }: {
    route: { owner: string; repo: string; number: number };
    pull: PullRequestDetail;
    tab: PullTab;
    viewerId?: string;
    publicRepository: boolean;
  } = $props();
  const pageState = new PullPageState(
    () => route,
    () => source,
    () => tab
  );
  const mergeability = new PullMergeability();
  const context = $derived({ owner: route.owner, repository: route.repo });
  const pull = $derived(pageState.pull);
  let editing = $state(false);
  let changesView = $state<HTMLElement>();

  const mergeableHeads = $derived(
    ['draft', 'merged', 'closed'].includes(pull.state) ? null : `${pull.targetCommitId}:${pull.sourceCommitId}`
  );

  $effect(() => {
    if (!mergeableHeads) return;
    const [base, head] = mergeableHeads.split(':');
    return untrack(() => mergeability.check(pageState.endpoint, base, head));
  });

  $effect(() =>
    connectPullLive({
      path: `/api/v1/repositories/${encodeURIComponent(route.owner)}/${encodeURIComponent(route.repo)}/pulls/${route.number}/live`,
      onUpdate: pageState.applyUpdate,
      catchUp: pageState.catchUp
    })
  );

  $effect(() => {
    if (pageState.tab === 'changes') untrack(() => void pageState.loadDiff());
  });

  afterNavigate(({ type, from, to }) => {
    const openedChanges = to?.params?.tab === 'changes' && from?.params?.tab !== 'changes';
    if (type === 'popstate' || from?.route.id !== to?.route.id || !openedChanges) return;
    changesView?.scrollIntoView({
      behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
      block: 'start'
    });
  });

  const tabOrder: PullTab[] = ['overview', 'changes', 'commits', 'checks'];
  const openConversations = '[data-review-thread="open"]';

  async function nextConversation() {
    if (pageState.tab !== 'overview' && pageState.tab !== 'changes') await pageState.selectTab('overview');
    await tick();
    stepThrough(openConversations, 1);
  }

  async function shortcut(event: KeyboardEvent) {
    const key = plainKey(event);
    if (!key) return;
    const tabIndex = Number(key) - 1;
    if (tabOrder[tabIndex]) void pageState.selectTab(tabOrder[tabIndex]);
    else if ((key === 'j' || key === 'k') && pageState.tab === 'changes')
      stepThrough('[data-review-file]', key === 'j' ? 1 : -1);
    else if (key === 'n' || key === 'p') stepThrough(openConversations, key === 'n' ? 1 : -1);
    else if (key === 'r' && pageState.reviewable) {
      if (pageState.tab !== 'changes') await pageState.selectTab('changes');
      pageState.reviewOpen = true;
    } else if (key === 'c' && viewerId) {
      if (pageState.tab !== 'overview') await pageState.selectTab('overview');
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
  class="grid items-start gap-7 lg:grid-cols-[360px_minmax(0,1fr)] lg:gap-8 xl:grid-cols-[420px_minmax(0,1fr)] xl:gap-10"
>
  <PullSummary
    {pull}
    busy={pageState.busy}
    {context}
    onEdit={() => (editing = true)}
    onUpdate={pageState.updateMetadata}
    onCreateLabel={pageState.createLabel}
    onReport={viewerId ? () => reporting.open({ type: 'pull', id: pull.id, label: 'pull' }) : undefined}
  >
    {#snippet status()}
      <PullStatus
        {pull}
        conflicted={mergeability.checked ? mergeability.conflicted : null}
        checksHref={pageState.tabHref('checks')}
        onNextConversation={nextConversation}
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
      </PullStatus>
    {/snippet}
  </PullSummary>

  <div class="min-w-0" bind:this={changesView}>
    <nav class="mb-4 flex gap-1.5 overflow-x-auto pb-0.5 max-sm:-mx-4 max-sm:px-4" aria-label="Pull sections">
      {#each tabs as { id, label, icon: Icon, count } (id)}
        <ChipLink active={pageState.tab === id} href={pageState.tabHref(id)} data-sveltekit-reset={false}
          ><Icon size={14} />{label}{#if count !== null}<span class="text-xs text-ink-muted tabular-nums">{count}</span
            >{/if}</ChipLink
        >
      {/each}
    </nav>
    {#if pageState.error}
      <Notice class="mb-4" dismissLabel="Dismiss error" ondismiss={() => (pageState.error = '')}
        >{pageState.error}</Notice
      >
    {/if}
    {#if pageState.revisionNotice}
      <Notice
        tone="brand"
        icon={GitCommitHorizontal}
        class="mb-4"
        dismissLabel="Dismiss revision update"
        ondismiss={() => (pageState.revisionNotice = false)}
        >A new revision arrived. Review it before submitting.</Notice
      >
    {/if}

    {#if pageState.tab === 'overview'}
      <PullOverview {pageState} {viewerId} signedIn={Boolean(viewerId)} {context} />
    {:else if pageState.tab === 'changes'}
      <PullChanges {pageState} {viewerId} {context} />
    {:else if pageState.tab === 'commits'}
      <PullCommits
        commits={pull.commits}
        revisions={pageState.timeline.revisions}
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
