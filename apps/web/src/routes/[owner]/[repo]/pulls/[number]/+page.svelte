<script lang="ts">
  import { page } from '$app/stores';
  import { tick, untrack } from 'svelte';
  import type { MergeMethod, PullRealtimeUpdate, PullRequestDetail, PullRequestDiff, PullTimelineWindow, ReviewThread as ReviewThreadType } from '@marl/contracts';
  import ArrowRight from 'lucide-svelte/icons/arrow-right';
  import BadgeCheck from 'lucide-svelte/icons/badge-check';
  import CircleAlert from 'lucide-svelte/icons/circle-alert';
  import CircleCheck from 'lucide-svelte/icons/circle-check';
  import CircleDot from 'lucide-svelte/icons/circle-dot';
  import FileDiff from 'lucide-svelte/icons/file-diff';
  import GitBranch from 'lucide-svelte/icons/git-branch';
  import GitMerge from 'lucide-svelte/icons/git-merge';
  import GitCommitHorizontal from 'lucide-svelte/icons/git-commit-horizontal';
  import GitPullRequest from 'lucide-svelte/icons/git-pull-request';
  import GitPullRequestClosed from 'lucide-svelte/icons/git-pull-request-closed';
  import MessageSquare from 'lucide-svelte/icons/message-square';
  import Pencil from 'lucide-svelte/icons/pencil';
  import X from 'lucide-svelte/icons/x';
  import { api, MarlApiError } from '$lib/api';
  import Button from '$lib/components/Button.svelte';
  import Chip from '$lib/components/Chip.svelte';
  import MarkdownBody from '$lib/components/MarkdownBody.svelte';
  import MarkdownComposer from '$lib/components/MarkdownComposer.svelte';
  import Modal from '$lib/components/Modal.svelte';
  import PullActionComposer, { type PullComposerAction } from '$lib/components/PullActionComposer.svelte';
  import PullMetadata from '$lib/components/PullMetadata.svelte';
  import ReferenceTimelineEvent from '$lib/components/ReferenceTimelineEvent.svelte';
  import ReviewChangesPopover from '$lib/components/ReviewChangesPopover.svelte';
  import PullTimelineEvent from '$lib/components/PullTimelineEvent.svelte';
  import ReviewThread from '$lib/components/ReviewThread.svelte';
  import Seo from '$lib/components/Seo.svelte';
  import Time from '$lib/components/Time.svelte';
  import UserProfileLink from '$lib/components/UserProfileLink.svelte';
  import WorkItemLinks from '$lib/components/WorkItemLinks.svelte';
  import PullDecisionStrip from '$lib/pulls/PullDecisionStrip.svelte';
  import { PullTimelineState } from '$lib/pulls/PullTimelineState.svelte';
  import { connectPullLive } from '$lib/pulls/pull-live';
  import { seoExcerpt } from '$lib/seo';
  import type { PageData } from './$types';

  let { data } = $props<{ data: PageData }>();

  type Tab = 'overview' | 'commits' | 'changes' | 'checks';
  const owner = $derived($page.params.owner ?? '');
  const repo = $derived($page.params.repo ?? '');
  const number = $derived(Number($page.params.number));
  const markdownContext = $derived({ owner, repository: repo });
  let pull = $derived<PullRequestDetail>(data.pull);
  const timeline = $derived(new PullTimelineState(data.pull.timeline));
  let diff = $state<PullRequestDiff | null>(null);
  let DiffViewer = $state<typeof import('$lib/components/DiffViewer.svelte').default | null>(null);
  let diffLoading = $state(false);
  let tab = $state<Tab>('overview');
  let error = $state('');
  let reviewState = $state<'commented' | 'approved' | 'changes_requested'>('commented');
  let reviewBody = $state('');
  let reviewOpen = $state(false);
  let commentBody = $state('');
  let editingPullComment = $state<string | null>(null);
  let editingPullBody = $state('');
  let confirmingPullDelete = $state<string | null>(null);
  let busy = $state(false);
  let mergeMethod = $state<MergeMethod>('merge');
  let editingDetails = $state(false);
  let editedTitle = $state('');
  let editedBody = $state('');
  let changesView = $state<HTMLElement>();
  let pullGeneration = 0;
  let diffRequest = 0;

  let stateRefreshQueued = false;
  function scheduleStateRefresh() {
    if (stateRefreshQueued) return;
    stateRefreshQueued = true;
    const generation = pullGeneration;
    const route = { owner, repo, number };
    queueMicrotask(async () => {
      try {
        const result = await api<{ state: Partial<PullRequestDetail> }>(`/repositories/${route.owner}/${route.repo}/pulls/${route.number}/state`);
        if (generation !== pullGeneration) return;
        const version = Number(result.state.realtimeVersion ?? 0);
        if (version >= pull.realtimeVersion) pull = { ...pull, ...result.state, realtimeVersion: pull.realtimeVersion };
      } catch {}
      if (generation === pullGeneration) stateRefreshQueued = false;
    });
  }

  function patchDiffThread(id: string, patch: Record<string, unknown>) {
    if (!diff) return;
    const threads = diff.threads ?? [];
    const existing = threads.find((thread) => thread.id === id);
    if (!existing) return;
    diff = { ...diff, threads: threads.map((thread) => thread.id === id ? { ...thread, ...patch } as ReviewThreadType : thread) };
  }

  function applyUpdate(update?: PullRealtimeUpdate) {
    if (!update || update.version <= pull.realtimeVersion) return;
    if (update.version !== pull.realtimeVersion + 1) { void catchUp(); return; }
    const payload = update.payload;
    const previousSource = pull.sourceCommitId;
    const previousTarget = pull.targetCommitId;
    if (payload.details) pull = { ...pull, ...(payload.details as Partial<PullRequestDetail>) };
    if (payload.pull) pull = { ...pull, ...(payload.pull as Partial<PullRequestDetail>) };
    if (payload.label) {
      const label = payload.label as PullRequestDetail['labels'][number];
      if (!pull.availableLabels.some((item) => item.id === label.id)) pull = { ...pull, availableLabels: [...pull.availableLabels, label].sort((left, right) => left.name.localeCompare(right.name)) };
    }
    if (payload.metadata) {
      const metadata = payload.metadata as { assigneeIds?: string[]; labelIds?: string[]; locked?: boolean };
      pull = {
        ...pull,
        assignees: metadata.assigneeIds ? pull.availableAssignees.filter((person) => metadata.assigneeIds?.includes(person.id)) : pull.assignees,
        labels: metadata.labelIds ? pull.availableLabels.filter((label) => metadata.labelIds?.includes(label.id)) : pull.labels,
        locked: metadata.locked ?? pull.locked
      };
    }
    if (payload.comment) timeline.patch('comment', String((payload.comment as { id: string }).id), payload.comment as Record<string, unknown>);
    if (payload.thread) {
      const thread = payload.thread as { id: string } & Record<string, unknown>;
      timeline.patch('thread', String(thread.id), thread);
      patchDiffThread(String(thread.id), thread);
    }
    if (payload.threadComment) {
      const change = payload.threadComment as { threadId: string; comment: { id: string } & Record<string, unknown> };
      const thread = timeline.getThread(change.threadId);
      if (thread) {
        const exists = thread.comments.some((comment) => comment.id === change.comment.id);
        timeline.patch('thread', change.threadId, { comments: exists ? thread.comments.map((comment) => comment.id === change.comment.id ? { ...comment, ...change.comment } : comment) : [...thread.comments, change.comment] });
      }
      const diffThread = diff?.threads?.find((item) => item.id === change.threadId);
      if (diffThread) {
        const exists = diffThread.comments.some((comment) => comment.id === change.comment.id);
        patchDiffThread(change.threadId, { comments: exists ? diffThread.comments.map((comment) => comment.id === change.comment.id ? { ...comment, ...change.comment } : comment) : [...diffThread.comments, change.comment] });
      }
    }
    if (Array.isArray(payload.timelineRemoved)) timeline.remove(payload.timelineRemoved);
    if (Array.isArray(payload.timeline)) timeline.append(payload.timeline);
    pull = { ...pull, realtimeVersion: update.version };
    if (pull.sourceCommitId !== previousSource || pull.targetCommitId !== previousTarget) {
      diff = null;
      diffLoading = false;
      diffRequest += 1;
      if (tab === 'changes') void selectTab('changes');
    }
    if (payload.refreshState) scheduleStateRefresh();
  }

  let catchUpRequest: { generation: number; promise: Promise<void> } | null = null;
  function catchUp(generation = pullGeneration, route = { owner, repo, number }) {
    if (catchUpRequest?.generation === generation) return catchUpRequest.promise;
    const promise = runCatchUp(generation, route).finally(() => {
      if (catchUpRequest?.generation === generation) catchUpRequest = null;
    });
    catchUpRequest = { generation, promise };
    return promise;
  }

  async function runCatchUp(generation: number, route: { owner: string; repo: string; number: number }) {
    let hasMore = true;
    while (hasMore && generation === pullGeneration) {
      const result = await api<{ updates: PullRealtimeUpdate[]; hasMore: boolean; version: number }>(`/repositories/${route.owner}/${route.repo}/pulls/${route.number}/updates?after=${pull.realtimeVersion}`);
      if (generation !== pullGeneration) return;
      for (const update of result.updates) applyUpdate(update);
      hasMore = result.hasMore;
      if (!result.updates.length) pull = { ...pull, realtimeVersion: Math.max(pull.realtimeVersion, result.version) };
    }
  }

  $effect(() => {
    data.pull.id;
    const route = { owner, repo, number };
    const generation = ++pullGeneration;
    untrack(() => {
      diff = null;
      diffLoading = false;
      diffRequest += 1;
      tab = 'overview';
      error = '';
      reviewState = 'commented';
      reviewBody = '';
      reviewOpen = false;
      commentBody = '';
      editingPullComment = null;
      editingPullBody = '';
      confirmingPullDelete = null;
      busy = false;
      mergeMethod = 'merge';
      editingDetails = false;
      editedTitle = '';
      editedBody = '';
      stateRefreshQueued = false;
      catchUpRequest = null;
    });
    return connectPullLive({
      path: `/api/v1/repositories/${encodeURIComponent(route.owner)}/${encodeURIComponent(route.repo)}/pulls/${route.number}/live`,
      onUpdate: (update) => generation === pullGeneration && applyUpdate(update),
      catchUp: () => generation === pullGeneration ? catchUp(generation, route) : Promise.resolve()
    });
  });

  const changeThreads = $derived.by(() => {
    const threads: Record<string, ReviewThreadType> = Object.fromEntries((diff?.threads ?? []).map((thread) => [thread.id, thread]));
    for (const key of timeline.order) {
      const item = timeline.items.get(key);
      if (item?.kind === 'thread') threads[item.value.id] = item.value as ReviewThreadType;
    }
    return Object.values(threads);
  });

  async function loadOlderTimeline() {
    const before = timeline.loadBeforeSequence;
    const after = timeline.firstBoundarySequence;
    if (!before || !after || busy) return;
    busy = true;
    try {
      const result = await api<{ timeline: PullTimelineWindow }>(`/repositories/${owner}/${repo}/pulls/${number}/timeline?before=${before}&after=${after}`);
      timeline.mergeOlder(result.timeline);
    } catch (cause) { error = cause instanceof MarlApiError ? cause.message : 'Older conversation could not be loaded.'; }
    finally { busy = false; }
  }

  async function selectTab(next: Tab) {
    const shouldFocusChanges = next === 'changes' && tab !== 'changes';
    tab = next;
    if (shouldFocusChanges) {
      await tick();
      changesView?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
    }
    if (next !== 'changes' || diff || diffLoading) return;
    const request = ++diffRequest;
    const generation = pullGeneration;
    const route = { owner, repo, number };
    diffLoading = true;
    try {
      const [loadedDiff, viewer] = await Promise.all([
        api<PullRequestDiff>(`/repositories/${route.owner}/${route.repo}/pulls/${route.number}/diff`),
        import('$lib/components/DiffViewer.svelte')
      ]);
      if (request !== diffRequest || generation !== pullGeneration) return;
      diff = loadedDiff; DiffViewer = viewer.default;
    }
    catch (cause) { if (request === diffRequest && generation === pullGeneration) error = cause instanceof MarlApiError ? cause.message : 'Changes could not be loaded.'; }
    finally { if (request === diffRequest && generation === pullGeneration) diffLoading = false; }
  }

  async function submitReview() {
    if (!pull || busy) return; busy = true; error = '';
    try { const result = await api<{ update: PullRealtimeUpdate }>(`/repositories/${owner}/${repo}/pulls/${number}/reviews`, { method: 'POST', body: JSON.stringify({ state: reviewState, body: reviewBody }) }); applyUpdate(result.update); reviewBody = ''; reviewOpen = false; tab = 'overview'; }
    catch (cause) { error = cause instanceof MarlApiError ? cause.message : 'Review could not be submitted.'; }
    finally { busy = false; }
  }

  async function reply(threadId: string, body: string) {
    if (!body.trim() || busy) return; busy = true;
    try { const result = await api<{ update: PullRealtimeUpdate }>(`/review-threads/${threadId}/comments`, { method: 'POST', body: JSON.stringify({ body }) }); applyUpdate(result.update); }
    catch (cause) { error = cause instanceof MarlApiError ? cause.message : 'Reply could not be added.'; }
    finally { busy = false; }
  }

  async function saveComment(commentId: string, body: string) {
    if (!body.trim() || busy) return; busy = true;
    try { const result = await api<{ update: PullRealtimeUpdate }>(`/review-comments/${commentId}`, { method: 'PATCH', body: JSON.stringify({ body }) }); applyUpdate(result.update); }
    catch (cause) { error = cause instanceof MarlApiError ? cause.message : 'Comment could not be updated.'; }
    finally { busy = false; }
  }

  async function deleteComment(commentId: string) {
    if (busy) return; busy = true;
    try { const result = await api<{ update: PullRealtimeUpdate }>(`/review-comments/${commentId}`, { method: 'DELETE' }); applyUpdate(result.update); }
    catch (cause) { error = cause instanceof MarlApiError ? cause.message : 'Comment could not be deleted.'; }
    finally { busy = false; }
  }

  async function addPullComment() {
    if (!commentBody.trim() || busy) return; busy = true; error = '';
    try { const result = await api<{ update: PullRealtimeUpdate }>(`/repositories/${owner}/${repo}/pulls/${number}/comments`, { method: 'POST', body: JSON.stringify({ body: commentBody }) }); applyUpdate(result.update); commentBody = ''; }
    catch (cause) { error = cause instanceof MarlApiError ? cause.message : 'Comment could not be added.'; }
    finally { busy = false; }
  }

  async function savePullComment(commentId: string) {
    if (!editingPullBody.trim() || busy) return; busy = true;
    try { const result = await api<{ update: PullRealtimeUpdate }>(`/pull-comments/${commentId}`, { method: 'PATCH', body: JSON.stringify({ body: editingPullBody }) }); applyUpdate(result.update); editingPullComment = null; editingPullBody = ''; }
    catch (cause) { error = cause instanceof MarlApiError ? cause.message : 'Comment could not be updated.'; }
    finally { busy = false; }
  }

  async function deletePullComment(commentId: string) {
    if (busy) return; busy = true;
    try { const result = await api<{ update: PullRealtimeUpdate }>(`/pull-comments/${commentId}`, { method: 'DELETE' }); applyUpdate(result.update); confirmingPullDelete = null; }
    catch (cause) { error = cause instanceof MarlApiError ? cause.message : 'Comment could not be deleted.'; }
    finally { busy = false; }
  }

  async function createLineComment(draft: { path: string; side: 'old' | 'new'; startLine: number; line: number }, body: string) {
    if (!body.trim() || busy) return; busy = true;
    try { const result = await api<{ update: PullRealtimeUpdate }>(`/repositories/${owner}/${repo}/pulls/${number}/threads`, { method: 'POST', body: JSON.stringify({ ...draft, startSide: draft.side, body }) }); applyUpdate(result.update); }
    catch (cause) { error = cause instanceof MarlApiError ? cause.message : 'Comment could not be added.'; }
    finally { busy = false; }
  }
  async function loadPatch(file: PullRequestDiff['files'][number]) {
    const result = await api<{ patch: string }>(`/repositories/${owner}/${repo}/pulls/${number}/patch?path=${encodeURIComponent(file.path)}`);
    return result.patch;
  }

  async function updateMetadata(body: { assigneeIds?: string[]; labelIds?: string[]; locked?: boolean }) {
    if (busy) return; busy = true; error = '';
    try { const result = await api<{ update?: PullRealtimeUpdate }>(`/repositories/${owner}/${repo}/pulls/${number}/metadata`, { method: 'PATCH', body: JSON.stringify(body) }); applyUpdate(result.update); }
    catch (cause) { error = cause instanceof MarlApiError ? cause.message : 'Pull metadata could not be updated.'; }
    finally { busy = false; }
  }

  async function createLabel(name: string) {
    if (busy) return;
    busy = true; error = '';
    try {
      const result = await api<{ label: PullRequestDetail['labels'][number]; applied: boolean; update?: PullRealtimeUpdate }>(`/repositories/${owner}/${repo}/pulls/${number}/labels`, { method: 'POST', body: JSON.stringify({ name }) });
      if (result.update) applyUpdate(result.update);
      else pull = {
        ...pull,
        availableLabels: pull.availableLabels.some((label) => label.id === result.label.id) ? pull.availableLabels : [...pull.availableLabels, result.label],
        labels: pull.labels.some((label) => label.id === result.label.id) ? pull.labels : [...pull.labels, result.label]
      };
    } catch (cause) { error = cause instanceof MarlApiError ? cause.message : 'Label could not be created.'; }
    finally { busy = false; }
  }

  async function setThreadResolved(threadId: string, resolved: boolean) {
    if (busy) return; busy = true; error = '';
    const before = timeline.get('thread', threadId);
    timeline.patch('thread', threadId, { resolved });
    try { const result = await api<{ update?: PullRealtimeUpdate }>(`/review-threads/${threadId}/resolve`, { method: 'POST', body: JSON.stringify({ resolved }) }); applyUpdate(result.update); }
    catch (cause) { error = cause instanceof MarlApiError ? cause.message : 'Conversation could not be updated.'; timeline.restore(before); }
    finally { busy = false; }
  }

  async function composerAction(action: PullComposerAction) {
    if (busy) return;
    busy = true; error = '';
    try {
      if (action === 'approve' || action === 'request_changes') {
        const result = await api<{ update: PullRealtimeUpdate }>(`/repositories/${owner}/${repo}/pulls/${number}/reviews`, { method: 'POST', body: JSON.stringify({ state: action === 'approve' ? 'approved' : 'changes_requested', body: commentBody }) }); applyUpdate(result.update);
      } else {
        if (commentBody.trim() && !pull.locked) { const result = await api<{ update: PullRealtimeUpdate }>(`/repositories/${owner}/${repo}/pulls/${number}/comments`, { method: 'POST', body: JSON.stringify({ body: commentBody }) }); applyUpdate(result.update); }
        const result = action === 'merge'
          ? await api<{ update: PullRealtimeUpdate }>(`/repositories/${owner}/${repo}/pulls/${number}/merge`, { method: 'POST', body: JSON.stringify({ method: mergeMethod }) })
          : await api<{ update: PullRealtimeUpdate }>(`/repositories/${owner}/${repo}/pulls/${number}/${action}`, { method: 'POST', body: '{}' });
        applyUpdate(result.update);
      }
      commentBody = '';
    } catch (cause) { error = cause instanceof MarlApiError ? cause.message : 'Pull action could not be completed.'; }
    finally { busy = false; }
  }

  function openDetailsEditor() {
    editedTitle = pull.title;
    editedBody = pull.body;
    editingDetails = true;
  }

  async function saveDetails() {
    if (busy || !editedTitle.trim()) return;
    busy = true; error = '';
    try {
      const result = await api<{ update: PullRealtimeUpdate }>(`/repositories/${owner}/${repo}/pulls/${number}`, { method: 'PATCH', body: JSON.stringify({ title: editedTitle, body: editedBody }) });
      applyUpdate(result.update);
      editingDetails = false;
    } catch (cause) { error = cause instanceof MarlApiError ? cause.message : 'Pull details could not be updated.'; }
    finally { busy = false; }
  }

</script>

<Seo title={`${pull?.title ?? `Pull !${number}`} · ${owner}/${repo} · Marl`} description={seoExcerpt(pull?.body, `${pull?.title ?? `Pull !${number}`} — proposed changes for ${owner}/${repo}.`)} path={$page.url.pathname} robots={data.repository.visibility === 'public' ? 'index, follow' : 'noindex, nofollow'} />

{#if !pull}
  <div class="fatal"><CircleAlert size={24} /><strong>Pull unavailable</strong><p>{error}</p><a href="/{owner}/{repo}/pulls">Back to pulls</a></div>
{:else}
  <header class="pr-header">
    <p class="route-context"><a href="/{owner}/{repo}">{owner}/{repo}</a><span>·</span>Pull !{pull.number}</p>
    <div class="title-row">
      <span class="state {pull.state}">{#if pull.state === 'merged'}<GitMerge size={18} />{:else if pull.state === 'closed'}<GitPullRequestClosed size={18} />{:else}<GitPullRequest size={18} />{/if}</span>
      <h1>{pull.title}</h1>
      {#if pull.canManage}<Button size="small" disabled={busy} onclick={openDetailsEditor}><Pencil size={13} />Edit</Button>{/if}
    </div>
    <div class="revision-line">
      <span class="state-copy">{pull.state}</span>
      <UserProfileLink handle={pull.author} displayName={pull.authorDisplayName} avatar={false} />
      <span>proposes</span><code>{pull.sourceBranch}</code><ArrowRight size={12} /><code>{pull.targetBranch}</code>
      <span>·</span><span>revision {pull.sourceCommitId.slice(0, 7)}</span>
    </div>
  </header>

  <PullDecisionStrip {pull} viewerHandle={data.shellUser?.handle} />

  <nav class="tabs" aria-label="Pull sections">
    <Chip active={tab === 'overview'} onclick={() => selectTab('overview')}><MessageSquare size={14} />Overview <span class="count">{timeline.total}</span></Chip>
    <Chip active={tab === 'changes'} onclick={() => selectTab('changes')}><FileDiff size={14} />Changes {#if diff}<span class="count">{diff.files.length}</span>{/if}</Chip>
    <Chip active={tab === 'commits'} onclick={() => selectTab('commits')}><GitCommitHorizontal size={14} />Commits <span class="count">{pull.commits.length}</span></Chip>
    <Chip active={tab === 'checks'} onclick={() => selectTab('checks')}><CircleCheck size={14} />Checks <span class="count">{pull.checks.length}</span></Chip>
  </nav>
  {#if error}<div class="action-error" role="alert"><CircleAlert size={15} /><span>{error}</span><Button icon size="small" variant="ghost" aria-label="Dismiss error" onclick={() => (error = '')}><X size={13} /></Button></div>{/if}

  {#if tab === 'overview'}
    <div class="overview-layout">
      <main class="workspace">
        <article class="brief">
          <header><h2>Change brief</h2>{#if pull.canManage}<Button size="small" variant="ghost" disabled={busy} onclick={openDetailsEditor}><Pencil size={13} />Edit brief</Button>{/if}</header>
          <div class="brief-body"><MarkdownBody source={pull.body || 'No change brief was provided.'} context={markdownContext} /></div>
        </article>
        <section class="activity">
          <header><h2>Review activity</h2><span>{timeline.total}</span></header>
          <div class="timeline">
            {#each timeline.order as key, index (key)}
              {@const item = timeline.items.get(key)}
              {#if item}
                {#if timeline.hidden > 0 && index === 2}<Button class="timeline-gap" variant="ghost" block loading={busy} onclick={loadOlderTimeline}>{timeline.hidden} updates hidden <span>Load earlier activity</span></Button>{/if}
                {#if item.kind === 'event'}
                  <PullTimelineEvent event={item.value} />
                {:else if item.kind === 'reference'}
                  <ReferenceTimelineEvent reference={item.value} />
                {:else if item.kind === 'review'}
                  <article class="event"><span class="event-icon {item.value.state}">{#if item.value.state === 'approved'}<CircleCheck size={15} />{:else if item.value.state === 'changes_requested'}<CircleAlert size={15} />{:else}<MessageSquare size={15} />{/if}</span><div><p><UserProfileLink handle={item.value.author} displayName={item.value.authorDisplayName} avatar={false} /> {item.value.state === 'approved' ? 'approved this revision' : item.value.state === 'changes_requested' ? 'requested changes' : 'finished a review'} <Time class="end" value={item.value.createdAt} /></p>{#if item.value.body}<div class="event-body"><MarkdownBody source={item.value.body} context={markdownContext} /></div>{/if}</div></article>
                {:else if item.kind === 'thread'}
                  <ReviewThread thread={item.value} {busy} interactive={pull.canManage && !pull.locked} context={markdownContext} onReply={reply} onResolve={setThreadResolved} onEdit={saveComment} onDelete={deleteComment} />
                {:else}
                  <article class="comment"><header><UserProfileLink handle={item.value.author} displayName={item.value.authorDisplayName} avatarUrl={item.value.authorAvatarUrl} size={25} /><span>commented</span><Time class="end" value={item.value.createdAt} />{#if item.value.canEdit && !item.value.deleted}<div class="comment-actions">{#if confirmingPullDelete === item.value.id}<Button size="small" variant="danger-soft" onclick={() => deletePullComment(item.value.id)}>Delete</Button><Button size="small" variant="ghost" onclick={() => (confirmingPullDelete = null)}>Cancel</Button>{:else}<Button size="small" variant="ghost" onclick={() => { editingPullComment = item.value.id; editingPullBody = item.value.body; }}>Edit</Button><Button size="small" variant="ghost" onclick={() => (confirmingPullDelete = item.value.id)}>Delete</Button>{/if}</div>{/if}</header><div>{#if item.value.deleted}<p class="deleted">Comment deleted</p>{:else if editingPullComment === item.value.id}<MarkdownComposer bind:value={editingPullBody} context={markdownContext} minHeight={90} /><footer class="comment-edit-actions"><Button size="small" onclick={() => (editingPullComment = null)}>Cancel</Button><Button size="small" variant="primary" disabled={busy || !editingPullBody.trim()} onclick={() => savePullComment(item.value.id)}>Save</Button></footer>{:else}<MarkdownBody source={item.value.body} context={markdownContext} />{/if}</div></article>
                {/if}
              {/if}
            {:else}<p class="quiet-activity">No review activity yet. The brief and latest revision are ready for a first pass.</p>{/each}
            {#if data.shellUser}<PullActionComposer bind:value={commentBody} bind:mergeMethod context={markdownContext} pullState={pull.state} ready={pull.mergeRequirements.ready} locked={pull.locked} {busy} canManage={pull.canManage} canMerge={pull.canMerge} allowedMergeMethods={pull.allowedMergeMethods} avatarName={data.shellUser.displayName} avatarUrl={data.shellUser.avatarUrl} onComment={addPullComment} onAction={composerAction} />{/if}
          </div>
        </section>
      </main>
      <aside class="sidebar"><WorkItemLinks items={pull.linkedItems} /><PullMetadata {pull} {busy} onUpdate={updateMetadata} onCreateLabel={createLabel} /></aside>
    </div>
  {:else if tab === 'commits'}
    <section class="commit-list">{#each pull.commits as commit (commit.id)}<article><span class="commit-mark"><GitCommitHorizontal size={14} /></span><span><a class="commit-title" href="/{pull.sourceRepository?.owner ?? owner}/{pull.sourceRepository?.name ?? repo}/commit/{commit.id}">{commit.title}</a><small><UserProfileLink handle={commit.authorHandle} displayName={commit.authorDisplayName || commit.author} avatar={false} /> · <Time value={commit.authoredAt} />{#if commit.signatureStatus === 'verified'}<i><BadgeCheck size={12} />Verified</i>{/if}</small></span><code>{commit.shortId}</code></article>{:else}<div><strong>No commits to merge</strong><p>The target branch already contains this pull head.</p></div>{/each}</section>
  {:else if tab === 'changes'}
    <section class="changes-view" bind:this={changesView}>
      <header class="changes-head"><div><strong>Latest revision</strong><span>Reviewing <code>{pull.sourceCommitId.slice(0,7)}</code> from {pull.sourceBranch} against {pull.targetBranch}</span></div>{#if pull.canManage && !pull.locked && pull.state !== 'merged' && pull.state !== 'closed'}<ReviewChangesPopover bind:open={reviewOpen} bind:reviewState bind:body={reviewBody} context={markdownContext} {busy} onSubmit={submitReview} />{/if}</header>
      {#if diffLoading}<div class="changes-loading" aria-label="Loading changes"></div>{:else if diff && DiffViewer}<DiffViewer files={diff.files} threads={changeThreads} context={markdownContext} {busy} reviewable={pull.canManage && !pull.locked && pull.state !== 'merged' && pull.state !== 'closed'} onLoadPatch={loadPatch} onCreate={createLineComment} onReply={reply} onResolve={setThreadResolved} onEdit={saveComment} onDelete={deleteComment} />{/if}
    </section>
  {:else}
    <section class="checks-page"><header><h2>Checks for <code>{pull.sourceCommitId.slice(0,7)}</code></h2><p>Required checks must pass on the latest commit.</p></header>{#each pull.checks as check (check.id)}<article><span class="check-icon {check.state}">{#if check.state === 'success'}<CircleCheck size={17} />{:else if check.state === 'failure'}<CircleAlert size={17} />{:else}<CircleDot size={17} />{/if}</span><div><strong>{check.name}</strong><p>{check.summary}</p></div><span>{check.state}</span></article>{:else}<div class="empty-checks"><CircleDot size={22} /><strong>No checks reported</strong><p>Push a workflow or attach a self-hosted runner to report checks.</p></div>{/each}</section>
  {/if}

  <Modal open={editingDetails} title="Edit pull" description="Changes are recorded in review activity." onClose={() => (editingDetails = false)}>
    {#snippet children()}<div class="details-editor"><label><span>Title</span><input bind:value={editedTitle} maxlength="240" /></label><label><span>Description</span><MarkdownComposer bind:value={editedBody} context={markdownContext} minHeight={160} /></label></div>{/snippet}
    {#snippet actions()}<Button size="small" onclick={() => (editingDetails = false)}>Cancel</Button><Button size="small" variant="primary" loading={busy} disabled={editedTitle.trim().length < 3} onclick={saveDetails}>Save changes</Button>{/snippet}
  </Modal>
{/if}

<style>
  .timeline>.comment,.timeline>.event{content-visibility:auto;contain-intrinsic-size:auto 120px}
  :global(.timeline-gap.button){height:auto;min-height:36px;background:var(--surface-muted);font-size:9px}:global(.timeline-gap.button span){color:var(--brand);font-weight:650}.changes-loading{height:260px;border-radius:8px;background:var(--surface-muted);animation:changes-loading 1.2s ease-in-out infinite alternate}@keyframes changes-loading{to{opacity:.48}}
  .fatal{padding:70px 20px;text-align:center;color:var(--text-faint)}.fatal strong{display:block;margin-top:10px;color:var(--text-strong)}.fatal p{font-size:11px}.fatal a{color:var(--brand);font-size:11px}.pr-header{padding:3px 0 20px}.route-context{display:flex;align-items:center;gap:5px;margin:0 0 11px;color:var(--text-faint);font-size:9px}.route-context a{color:var(--text-muted);text-decoration:none}.route-context a:hover{color:var(--brand)}.title-row{display:grid;grid-template-columns:36px minmax(0,1fr) auto;align-items:center;gap:11px}.title-row h1{margin:0;color:var(--text-strong);font-size:25px;font-weight:680;letter-spacing:-.03em;line-height:1.15;text-wrap:balance}.state{display:grid;width:34px;height:34px;place-items:center;border-radius:9px;background:var(--success-soft);color:var(--success)}.state.merged{background:color-mix(in srgb,#8b5cf6 17%,transparent);color:#a78bfa}.state.blocked,.state.closed{background:var(--danger-soft);color:var(--danger)}.state.draft{background:var(--surface-muted);color:var(--text-faint)}.revision-line{display:flex;flex-wrap:wrap;align-items:center;gap:5px;margin:10px 0 0 46px;color:var(--text-faint);font-size:9px}.revision-line .state-copy{color:var(--text-muted);font-weight:650;text-transform:capitalize}.revision-line code{padding:2px 5px;border-radius:4px;background:var(--surface-muted);color:var(--text-strong)}.revision-line :global(.user-profile-link){font-size:9px}
  .tabs{display:flex;flex-wrap:wrap;gap:7px;margin-bottom:20px}.tabs .count{display:inline-grid;min-width:18px;height:18px;place-items:center;padding:0 5px;border-radius:999px;background:var(--surface-muted);color:var(--text-faint);font-size:9px}.tabs :global(.chip.active .count){background:color-mix(in srgb,var(--brand) 13%,var(--surface-muted));color:var(--brand-strong)}.action-error{display:grid;grid-template-columns:18px minmax(0,1fr) 30px;align-items:center;gap:6px;margin:-8px 0 14px;padding:8px 8px 8px 11px;border-left:2px solid var(--danger);border-radius:0 6px 6px 0;background:var(--danger-soft);color:var(--danger);font-size:10px}
  .overview-layout{display:grid;grid-template-columns:minmax(0,1fr) 280px;align-items:start;gap:24px}.workspace{display:grid;gap:44px}.brief{padding:0 4px}.brief>header,.activity>header{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;margin-bottom:18px}.brief h2,.activity h2{margin:0;color:var(--text-strong);font-size:13px;font-weight:660;letter-spacing:-.01em}.brief-body{color:var(--text);font-size:11px}.activity>header{margin:0 4px 14px}.activity>header>span{color:var(--text-faint);font-size:9px;font-variant-numeric:tabular-nums}.timeline{display:grid;gap:16px}.comment{padding:8px 4px 13px}.comment>header{display:flex;align-items:center;gap:6px;min-height:28px;color:var(--text-muted);font-size:10px}.comment>header :global(.user-profile-link){font-size:10px}.comment>div{padding:10px 0 0 33px}.event{display:grid;grid-template-columns:29px 1fr;align-items:start;gap:9px;padding:4px}.event-icon{display:grid;width:27px;height:27px;place-items:center;border-radius:50%;background:var(--surface-muted);color:var(--text-muted)}.event-icon.approved{background:var(--success-soft);color:var(--success)}.event-icon.changes_requested{background:var(--danger-soft);color:var(--danger)}.event p{display:flex;flex-wrap:wrap;gap:3px;margin:6px 0 0;color:var(--text-muted);font-size:10px}.event p :global(.user-profile-link){font-size:10px}.event-body{margin-top:9px;padding:11px 13px;border-left:2px solid var(--border-strong);background:var(--surface-muted)}.comment-actions{display:flex;gap:3px;margin-left:8px}.comment-edit-actions{display:flex;justify-content:flex-end;gap:6px;margin-top:8px}.deleted,.quiet-activity{margin:0;color:var(--text-faint);font-size:10px;font-style:italic}.quiet-activity{padding:24px 4px;font-style:normal}.sidebar{position:sticky;top:68px}
  .commit-list{display:grid;gap:4px}.commit-list>article{position:relative;display:grid;grid-template-columns:30px 1fr auto;align-items:center;gap:9px;min-height:62px;padding:8px 10px;border-radius:8px;color:inherit}.commit-list>article:hover{background:var(--surface-hover)}.commit-mark{display:grid;width:28px;height:28px;place-items:center;border-radius:50%;background:var(--surface-muted);color:var(--text-muted)}.commit-list .commit-title,.commit-list small{display:block}.commit-list .commit-title{color:var(--text-strong);font-size:11px;font-weight:650;text-decoration:none}.commit-list .commit-title::after{position:absolute;inset:0;content:''}.commit-list small{display:flex;align-items:center;gap:3px;margin-top:3px;color:var(--text-faint);font-size:9px}.commit-list small :global(.user-profile-link){position:relative;z-index:1;color:var(--text-muted);font-size:9px}.commit-list small i{display:inline-flex;align-items:center;gap:3px;margin-left:7px;color:var(--success);font-style:normal;font-weight:650}.commit-list code{color:var(--text-muted);font-size:9px}.commit-list>div{padding:45px;text-align:center}.commit-list>div strong{font-size:12px}.commit-list>div p{color:var(--text-faint);font-size:10px}
  .changes-view{min-height:calc(100dvh / var(--interface-scale) - 64px);scroll-margin-top:64px}.changes-head{display:flex;min-height:58px;align-items:center;justify-content:space-between;gap:14px;margin-bottom:12px;padding:0 5px}.changes-head>div:first-child strong,.changes-head>div:first-child span{display:block}.changes-head>div:first-child strong{color:var(--text-strong);font-size:11px}.changes-head>div:first-child span{margin-top:3px;color:var(--text-faint);font-size:9px}
  .checks-page>header{padding:14px 5px}.checks-page h2{margin:0;color:var(--text-strong);font-size:12px}.checks-page header p{margin:4px 0 0;color:var(--text-faint);font-size:9px}.checks-page article{display:grid;grid-template-columns:32px 1fr auto;align-items:center;gap:10px;min-height:65px;padding:10px 5px}.check-icon{display:grid;width:30px;height:30px;place-items:center;border-radius:7px}.check-icon.success{background:var(--success-soft);color:var(--success)}.check-icon.failure{background:var(--danger-soft);color:var(--danger)}.check-icon.running,.check-icon.queued{background:var(--brand-soft);color:var(--brand)}.checks-page article strong{color:var(--text-strong);font-size:11px}.checks-page article p{margin:3px 0 0;color:var(--text-faint);font-size:9px}.checks-page article>span:last-child{color:var(--text-muted);font-size:9px;text-transform:capitalize}.empty-checks{padding:50px 20px;color:var(--text-faint);text-align:center}.empty-checks strong{display:block;margin-top:9px;color:var(--text-strong);font-size:12px}.empty-checks p{font-size:10px}
  .details-editor{display:grid;gap:14px}.details-editor label>span{display:block;margin-bottom:6px;color:var(--text-muted);font-size:9px;font-weight:620}.details-editor input{width:100%;height:38px;padding:0 10px;border:1px solid var(--border);border-radius:7px;outline:0;background:var(--surface);color:var(--text-strong);font-size:11px}.details-editor input:focus{border-color:var(--brand)}
  @media(max-width:900px){.overview-layout{grid-template-columns:1fr}.sidebar{position:static;grid-row:1}}@media(max-width:600px){.title-row{grid-template-columns:34px minmax(0,1fr)}.title-row>:global(.button){grid-column:2;justify-self:start}.title-row h1{font-size:21px}.revision-line{margin-left:45px}.tabs{flex-wrap:nowrap;overflow-x:auto;padding-bottom:2px}.overview-layout{gap:14px}.comment>div{padding-left:0}}
</style>
