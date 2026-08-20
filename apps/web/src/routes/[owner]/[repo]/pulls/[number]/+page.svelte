<script lang="ts">
  import { page } from '$app/stores';
  import { onMount, tick, untrack } from 'svelte';
  import type { MergeMethod, PullRealtimeUpdate, PullRequestDetail, PullRequestDiff, PullTimelineWindow } from '@marl/contracts';
  import ArrowRight from 'lucide-svelte/icons/arrow-right';
  import BadgeCheck from 'lucide-svelte/icons/badge-check';
  import Check from 'lucide-svelte/icons/check';
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
  import MarkdownBody from '$lib/components/MarkdownBody.svelte';
  import MarkdownComposer from '$lib/components/MarkdownComposer.svelte';
  import Modal from '$lib/components/Modal.svelte';
  import PullActionComposer, { type PullComposerAction } from '$lib/components/PullActionComposer.svelte';
  import PullMetadata from '$lib/components/PullMetadata.svelte';
  import ReviewChangesPopover from '$lib/components/ReviewChangesPopover.svelte';
  import PullTimelineEvent from '$lib/components/PullTimelineEvent.svelte';
  import ReviewThread from '$lib/components/ReviewThread.svelte';
  import Time from '$lib/components/Time.svelte';
  import UserProfileLink from '$lib/components/UserProfileLink.svelte';
  import { PullTimelineState } from '$lib/pulls/PullTimelineState.svelte';
  import { connectPullLive } from '$lib/pulls/pull-live';
  import type { PageData } from './$types';

  let { data } = $props<{ data: PageData }>();

  type Tab = 'conversation' | 'commits' | 'changes' | 'checks';
  const owner = $derived($page.params.owner);
  const repo = $derived($page.params.repo);
  const number = $derived(Number($page.params.number));
  let pull = $state<PullRequestDetail>(untrack(() => data.pull));
  const timeline = new PullTimelineState(untrack(() => data.pull.timeline));
  let diff = $state<PullRequestDiff | null>(null);
  let DiffViewer = $state<typeof import('$lib/components/DiffViewer.svelte').default | null>(null);
  let diffLoading = $state(false);
  let tab = $state<Tab>('conversation');
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

  let stateRefreshQueued = false;
  function scheduleStateRefresh() {
    if (stateRefreshQueued) return;
    stateRefreshQueued = true;
    queueMicrotask(async () => {
      try {
        const result = await api<{ state: Partial<PullRequestDetail> }>(`/repositories/${owner}/${repo}/pulls/${number}/state`);
        const version = Number(result.state.realtimeVersion ?? 0);
        if (version >= pull.realtimeVersion) pull = { ...pull, ...result.state, realtimeVersion: pull.realtimeVersion };
      } catch {}
      stateRefreshQueued = false;
    });
  }

  function applyUpdate(update?: PullRealtimeUpdate) {
    if (!update || update.version <= pull.realtimeVersion) return;
    if (update.version !== pull.realtimeVersion + 1) { void catchUp(); return; }
    const payload = update.payload;
    const previousSource = pull.sourceCommitId;
    const previousTarget = pull.targetCommitId;
    if (payload.details) pull = { ...pull, ...(payload.details as Partial<PullRequestDetail>) };
    if (payload.pull) pull = { ...pull, ...(payload.pull as Partial<PullRequestDetail>) };
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
    if (payload.thread) timeline.patch('thread', String((payload.thread as { id: string }).id), payload.thread as Record<string, unknown>);
    if (payload.threadComment) {
      const change = payload.threadComment as { threadId: string; comment: { id: string } & Record<string, unknown> };
      const thread = timeline.getThread(change.threadId);
      if (thread) {
        const exists = thread.comments.some((comment) => comment.id === change.comment.id);
        timeline.patch('thread', change.threadId, { comments: exists ? thread.comments.map((comment) => comment.id === change.comment.id ? { ...comment, ...change.comment } : comment) : [...thread.comments, change.comment] });
      }
    }
    if (Array.isArray(payload.timelineRemoved)) timeline.remove(payload.timelineRemoved);
    if (Array.isArray(payload.timeline)) timeline.append(payload.timeline);
    pull = { ...pull, realtimeVersion: update.version };
    if (pull.sourceCommitId !== previousSource || pull.targetCommitId !== previousTarget) {
      diff = null;
      if (tab === 'changes') void selectTab('changes');
    }
    if (payload.refreshState) scheduleStateRefresh();
  }

  let catchUpRequest: Promise<void> | null = null;
  function catchUp() {
    if (catchUpRequest) return catchUpRequest;
    catchUpRequest = runCatchUp().finally(() => (catchUpRequest = null));
    return catchUpRequest;
  }

  async function runCatchUp() {
    let hasMore = true;
    while (hasMore) {
      const result = await api<{ updates: PullRealtimeUpdate[]; hasMore: boolean; version: number }>(`/repositories/${owner}/${repo}/pulls/${number}/updates?after=${pull.realtimeVersion}`);
      for (const update of result.updates) applyUpdate(update);
      hasMore = result.hasMore;
      if (!result.updates.length) pull = { ...pull, realtimeVersion: Math.max(pull.realtimeVersion, result.version) };
    }
  }

  onMount(() => connectPullLive({
    path: `/api/v1/repositories/${encodeURIComponent(owner ?? '')}/${encodeURIComponent(repo ?? '')}/pulls/${number}/live`,
    onUpdate: applyUpdate,
    catchUp
  }));

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
    diffLoading = true;
    try {
      const [loadedDiff, viewer] = await Promise.all([
        api<PullRequestDiff>(`/repositories/${owner}/${repo}/pulls/${number}/diff`),
        import('$lib/components/DiffViewer.svelte')
      ]);
      diff = loadedDiff; DiffViewer = viewer.default;
    }
    catch (cause) { error = cause instanceof MarlApiError ? cause.message : 'Changes could not be loaded.'; }
    finally { diffLoading = false; }
  }

  async function submitReview() {
    if (!pull || busy) return; busy = true; error = '';
    try { const result = await api<{ update: PullRealtimeUpdate }>(`/repositories/${owner}/${repo}/pulls/${number}/reviews`, { method: 'POST', body: JSON.stringify({ state: reviewState, body: reviewBody }) }); applyUpdate(result.update); reviewBody = ''; reviewOpen = false; tab = 'conversation'; }
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
    catch (cause) { error = cause instanceof MarlApiError ? cause.message : 'Pull request metadata could not be updated.'; }
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
    } catch (cause) { error = cause instanceof MarlApiError ? cause.message : 'Pull request action could not be completed.'; }
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
    } catch (cause) { error = cause instanceof MarlApiError ? cause.message : 'Pull request details could not be updated.'; }
    finally { busy = false; }
  }

  function openCurrentThreads() {
    return pull.mergeRequirements.unresolvedConversations;
  }

</script>

<svelte:head><title>{pull?.title ?? `Pull request #${number}`} · {owner}/{repo} · Marl</title></svelte:head>

{#if !pull}
  <div class="fatal"><CircleAlert size={24} /><strong>Pull request unavailable</strong><p>{error}</p><a href="/{owner}/{repo}/pulls">Back to pull requests</a></div>
{:else}
  <header class="pr-header">
    <div class="title-row"><span class="state {pull.state}">{#if pull.state === 'merged'}<GitMerge size={17} />{:else if pull.state === 'closed'}<GitPullRequestClosed size={17} />{:else}<GitPullRequest size={17} />{/if}{pull.state}</span><h1>{pull.title} <small>#{pull.number}</small></h1>{#if pull.canManage}<div class="lifecycle"><button disabled={busy} onclick={openDetailsEditor}><Pencil size={13} />Edit</button></div>{/if}</div>
    <p><UserProfileLink handle={pull.author} displayName={pull.authorDisplayName} avatar={false} /> wants to merge <b>{pull.sourceBranch}</b> into <b>{pull.targetBranch}</b></p>
    <div class="head-meta"><code>{pull.sourceCommitId.slice(0,7)}</code><ArrowRight size={12} /><code>{pull.targetCommitId.slice(0,7)}</code>{#if diff}<span>·</span><span>{diff.files.length} changed files</span>{/if}</div>
  </header>

  <nav class="tabs" aria-label="Pull request sections">
    <button class:active={tab === 'conversation'} onclick={() => selectTab('conversation')}><MessageSquare size={15} />Conversation <span>{timeline.total}</span></button>
    <button class:active={tab === 'commits'} onclick={() => selectTab('commits')}><GitCommitHorizontal size={15} />Commits <span>{pull.commits.length}</span></button>
    <button class:active={tab === 'changes'} onclick={() => selectTab('changes')}><FileDiff size={15} />Changes {#if diff}<span>{diff.files.length}</span>{/if}</button>
    <button class:active={tab === 'checks'} onclick={() => selectTab('checks')}><CircleCheck size={15} />Checks <span>{pull.checks.length}</span></button>
  </nav>
  {#if error}<div class="action-error" role="alert"><CircleAlert size={15} /><span>{error}</span><button aria-label="Dismiss error" onclick={() => (error = '')}><X size={13} /></button></div>{/if}

  {#if tab === 'conversation'}
    <div class="conversation-layout">
      <main class="timeline">
        <article class="comment"><header><UserProfileLink handle={pull.author} displayName={pull.authorDisplayName} avatarUrl={pull.authorAvatar} size={25} /><span>opened this pull request</span><Time class="end" value={pull.createdAt} /></header><div><MarkdownBody source={pull.body || 'No description was provided.'} /></div></article>
        {#each timeline.order as key, index (key)}
          {@const item = timeline.items.get(key)}
          {#if item}
          {#if timeline.hidden > 0 && index === 2}<button class="timeline-gap" disabled={busy} onclick={loadOlderTimeline}>{timeline.hidden} comments and events hidden <span>Load earlier activity</span></button>{/if}
          {#if item.kind === 'event'}
            <PullTimelineEvent event={item.value} />
          {:else if item.kind === 'review'}
            <article class="event"><span class="event-icon {item.value.state}">{#if item.value.state === 'approved'}<CircleCheck size={15} />{:else if item.value.state === 'changes_requested'}<CircleAlert size={15} />{:else}<MessageSquare size={15} />{/if}</span><div><p><UserProfileLink handle={item.value.author} displayName={item.value.authorDisplayName} avatar={false} /> {item.value.state === 'approved' ? 'approved these changes' : item.value.state === 'changes_requested' ? 'requested changes' : 'reviewed this pull request'} <Time class="end" value={item.value.createdAt} /></p>{#if item.value.body}<div class="event-body"><MarkdownBody source={item.value.body} /></div>{/if}</div></article>
          {:else if item.kind === 'thread'}
            <ReviewThread thread={item.value} {busy} onReply={reply} onResolve={setThreadResolved} onEdit={saveComment} onDelete={deleteComment} />
          {:else}
            <article class="comment"><header><UserProfileLink handle={item.value.author} displayName={item.value.authorDisplayName} avatarUrl={item.value.authorAvatarUrl} size={25} /><span>commented</span><Time class="end" value={item.value.createdAt} />{#if item.value.canEdit && !item.value.deleted}<div class="comment-actions">{#if confirmingPullDelete === item.value.id}<button class="danger" onclick={() => deletePullComment(item.value.id)}>Delete</button><button onclick={() => (confirmingPullDelete = null)}>Cancel</button>{:else}<button onclick={() => { editingPullComment = item.value.id; editingPullBody = item.value.body; }}>Edit</button><button onclick={() => (confirmingPullDelete = item.value.id)}>Delete</button>{/if}</div>{/if}</header><div>{#if item.value.deleted}<p class="deleted">Comment deleted</p>{:else if editingPullComment === item.value.id}<MarkdownComposer bind:value={editingPullBody} minHeight={90} /><footer class="comment-edit-actions"><button onclick={() => (editingPullComment = null)}>Cancel</button><button class="primary" disabled={busy || !editingPullBody.trim()} onclick={() => savePullComment(item.value.id)}>Save</button></footer>{:else}<MarkdownBody source={item.value.body} />{/if}</div></article>
          {/if}
          {/if}
        {/each}
        <PullActionComposer bind:value={commentBody} bind:mergeMethod pullState={pull.state} ready={pull.mergeRequirements.ready} locked={pull.locked} {busy} allowedMergeMethods={pull.allowedMergeMethods} avatarName={data.shellUser?.displayName ?? pull.author} avatarUrl={data.shellUser?.avatarUrl} onComment={addPullComment} onAction={composerAction} />
      </main>
      <aside class="sidebar"><section class="merge-panel">
        <header>{#if pull.state === 'merged'}<span class="merge-icon merged"><GitMerge size={18} /></span><div><strong>Merged</strong><p>Commit <code>{pull.mergedCommitId?.slice(0,7)}</code> is on {pull.targetBranch}.</p></div>{:else}<span class="merge-icon"><GitMerge size={18} /></span><div><strong>{pull.state === 'mergeable' ? 'Ready to merge' : 'Merge requirements'}</strong><p>Review the current head before merging.</p></div>{/if}</header>
        {#if pull.state !== 'merged'}
          <ul><li class:passed={pull.mergeRequirements.checksPass}><Check size={13} />{pull.checkSummary.total ? `${pull.checkSummary.passed} of ${pull.checkSummary.total} checks passed` : 'No checks reported'}</li><li class:passed={pull.mergeRequirements.approvals >= pull.mergeRequirements.requiredApprovals}><Check size={13} />{pull.mergeRequirements.approvals} of {pull.mergeRequirements.requiredApprovals} required approvals</li><li class:passed={pull.mergeRequirements.conversationsPass}><Check size={13} />{openCurrentThreads()} unresolved current conversations</li></ul>
          {#if pull.mergeRequirements.reasons.length}<div class="requirement-reasons">{#each pull.mergeRequirements.reasons as reason}<p><CircleAlert size={12} />{reason}</p>{/each}</div>{/if}
        {/if}
      </section><PullMetadata {pull} {busy} onUpdate={updateMetadata} /></aside>
    </div>
  {:else if tab === 'commits'}
    <section class="commit-list">{#each pull.commits as commit}<article><span class="commit-mark"><GitCommitHorizontal size={14} /></span><span><a class="commit-title" href="/{pull.sourceRepository?.owner ?? owner}/{pull.sourceRepository?.name ?? repo}/commit/{commit.id}">{commit.title}</a><small><UserProfileLink handle={commit.authorHandle} displayName={commit.authorDisplayName || commit.author} avatar={false} /> · <Time value={commit.authoredAt} />{#if commit.signatureStatus === 'verified'}<i><BadgeCheck size={12} />Verified</i>{/if}</small></span><code>{commit.shortId}</code></article>{:else}<div><strong>No commits to merge</strong><p>The target branch already contains this pull request head.</p></div>{/each}</section>
  {:else if tab === 'changes'}
    <section class="changes-view" bind:this={changesView}>
      <header class="changes-head"><div><strong>Changes from {pull.sourceBranch}</strong><span>Review the current head <code>{pull.sourceCommitId.slice(0,7)}</code></span></div>{#if pull.state !== 'merged' && pull.state !== 'closed'}<ReviewChangesPopover bind:open={reviewOpen} bind:reviewState bind:body={reviewBody} {busy} onSubmit={submitReview} />{/if}</header>
      {#if diffLoading}<div class="changes-loading" aria-label="Loading changes"></div>{:else if diff && DiffViewer}<DiffViewer files={diff.files} threads={diff.threads ?? []} {busy} onLoadPatch={loadPatch} onCreate={createLineComment} onReply={reply} onResolve={setThreadResolved} onEdit={saveComment} onDelete={deleteComment} />{/if}
    </section>
  {:else}
    <section class="checks-page"><header><h2>Checks for <code>{pull.sourceCommitId.slice(0,7)}</code></h2><p>Required checks must pass on the latest commit.</p></header>{#each pull.checks as check}<article><span class="check-icon {check.state}">{#if check.state === 'success'}<CircleCheck size={17} />{:else if check.state === 'failure'}<CircleAlert size={17} />{:else}<CircleDot size={17} />{/if}</span><div><strong>{check.name}</strong><p>{check.summary}</p></div><span>{check.state}</span></article>{:else}<div class="empty-checks"><CircleDot size={22} /><strong>No checks reported</strong><p>Push a workflow or attach a self-hosted runner to report checks.</p></div>{/each}</section>
  {/if}

  <Modal open={editingDetails} title="Edit pull request" description="Changes are recorded in the conversation timeline." onClose={() => (editingDetails = false)}>
    {#snippet children()}<div class="details-editor"><label><span>Title</span><input bind:value={editedTitle} maxlength="240" /></label><label><span>Description</span><MarkdownComposer bind:value={editedBody} minHeight={160} /></label></div>{/snippet}
    {#snippet actions()}<button onclick={() => (editingDetails = false)}>Cancel</button><button class="primary" disabled={busy || editedTitle.trim().length < 3} onclick={saveDetails}>Save changes</button>{/snippet}
  </Modal>
{/if}

<style>
  .timeline>.comment,.timeline>.event{content-visibility:auto;contain-intrinsic-size:auto 120px}
  .timeline-gap{display:flex;width:100%;align-items:center;justify-content:center;gap:7px;padding:9px;border:0;border-radius:6px;background:var(--surface-muted);color:var(--text-muted);cursor:pointer;font-size:9px}.timeline-gap span{color:var(--brand);font-weight:650}.timeline-gap:hover{background:var(--surface-hover);color:var(--text-strong)}.timeline-gap:disabled{cursor:wait;opacity:.6}.changes-loading{height:260px;border-radius:8px;background:var(--surface-muted);animation:changes-loading 1.2s ease-in-out infinite alternate}@keyframes changes-loading{to{opacity:.48}}
  .fatal{padding:70px 20px;text-align:center;color:var(--text-faint)}.fatal strong{display:block;margin-top:10px;color:var(--text-strong)}.fatal p{font-size:11px}.fatal a{color:var(--brand);font-size:11px}.pr-header{padding:4px 0 23px}.title-row{display:flex;align-items:flex-start;gap:10px}.title-row h1{margin:0;color:var(--text-strong);font-size:23px;font-weight:660;letter-spacing:-.025em}.title-row h1 small{color:var(--text-faint);font-weight:500}.state{display:inline-flex;align-items:center;gap:5px;margin-top:1px;padding:5px 8px;border-radius:99px;background:var(--success-soft);color:var(--success);font-size:10px;font-weight:650;text-transform:capitalize}.state.merged{background:#eee7ff;color:#7145b8}.state.blocked,.state.closed{background:var(--danger-soft);color:var(--danger)}.pr-header>p{margin:10px 0 0;color:var(--text-muted);font-size:11px}.pr-header b{padding:2px 5px;border-radius:4px;background:var(--surface-muted);color:var(--text-strong);font-family:monospace;font-weight:500}.head-meta{display:flex;align-items:center;gap:6px;margin-top:9px;color:var(--text-faint);font-size:9px}.head-meta code{color:var(--text-muted)}
  .tabs{display:flex;height:42px;margin-bottom:20px;border-bottom:1px solid var(--border);gap:3px}.tabs button{position:relative;display:flex;align-items:center;gap:6px;padding:0 11px;border:0;background:transparent;color:var(--text-muted);cursor:pointer;font-size:11px;font-weight:580}.tabs button::after{position:absolute;inset:auto 7px -1px;height:2px;background:transparent;content:''}.tabs button.active{color:var(--text-strong)}.tabs button.active::after{background:var(--brand)}.tabs span{padding:1px 5px;border-radius:99px;background:var(--surface-muted);color:var(--text-faint);font-size:9px}.action-error{display:grid;grid-template-columns:18px minmax(0,1fr) 26px;align-items:center;gap:6px;margin:-8px 0 14px;padding:8px 8px 8px 11px;border-left:2px solid var(--danger);border-radius:0 6px 6px 0;background:var(--danger-soft);color:var(--danger);font-size:10px}.action-error button{display:grid;width:26px;height:26px;padding:0;border:0;border-radius:5px;background:transparent;color:inherit;cursor:pointer;place-items:center}.action-error button:hover{background:color-mix(in srgb,var(--danger) 12%,transparent)}
  .conversation-layout{display:grid;grid-template-columns:minmax(0,1fr) 300px;align-items:start;gap:20px}.timeline{display:grid;gap:13px}.comment{overflow:hidden;border:1px solid var(--border);border-radius:8px;background:var(--surface)}.comment>header{display:flex;align-items:center;gap:6px;min-height:45px;padding:0 12px;border-bottom:1px solid var(--border-subtle);background:var(--surface-muted);color:var(--text-muted);font-size:10px}.comment>header :global(.user-profile-link){font-size:10px}.avatar{display:grid;width:25px;height:25px;flex:0 0 auto;place-items:center;border-radius:50%;background:#d5b496;color:#3d2518;font-size:8px;font-weight:740}.comment>div{padding:18px}.event{display:grid;grid-template-columns:29px 1fr;align-items:start;gap:9px;padding:3px 6px}.event-icon{display:grid;width:27px;height:27px;place-items:center;border-radius:50%;background:var(--surface-muted);color:var(--text-muted)}.event-icon.approved{background:var(--success-soft);color:var(--success)}.event-icon.changes_requested{background:var(--danger-soft);color:var(--danger)}.event p{display:flex;gap:3px;margin:6px 0 0;color:var(--text-muted);font-size:10px}.event p :global(.user-profile-link){font-size:10px}.event-body{margin-top:9px;padding:11px 13px;border:1px solid var(--border);border-radius:7px;background:var(--surface)}.comment-actions{display:flex;gap:3px;margin-left:8px}.comment-actions button,.comment-edit-actions button{height:27px;padding:0 8px;border:1px solid var(--border);border-radius:5px;background:var(--surface);color:var(--text-muted);cursor:pointer;font-size:9px}.comment-actions button.danger{border-color:var(--danger);color:var(--danger)}.comment-edit-actions{display:flex;justify-content:flex-end;gap:6px;margin-top:8px}.deleted{margin:0;color:var(--text-faint);font-size:10px;font-style:italic}.primary{border-color:var(--brand)!important;background:var(--brand)!important;color:white!important}.primary:disabled{opacity:.5;cursor:not-allowed}
  .sidebar{position:sticky;top:68px}.merge-panel{overflow:hidden;border:1px solid var(--border);border-radius:9px;background:var(--surface)}.merge-panel>header{display:flex;gap:10px;padding:14px}.merge-icon{display:grid;width:34px;height:34px;flex:0 0 auto;place-items:center;border-radius:9px;background:var(--success-soft);color:var(--success)}.merge-icon.merged{background:#eee7ff;color:#7145b8}.merge-panel header strong{color:var(--text-strong);font-size:12px}.merge-panel header p{margin:4px 0 0;color:var(--text-faint);font-size:9px;line-height:1.45}.merge-panel ul{display:grid;gap:8px;margin:0;padding:12px 14px;border-top:1px solid var(--border);list-style:none}.merge-panel li{display:flex;align-items:center;gap:6px;color:var(--text-faint);font-size:9px}.merge-panel li.passed{color:var(--success)}
  .lifecycle{display:flex;gap:6px;margin-left:auto}.lifecycle button{display:flex;height:30px;align-items:center;gap:5px;padding:0 9px;border:1px solid var(--border);border-radius:6px;background:var(--surface);color:var(--text);cursor:pointer;font-size:9px}.lifecycle button:hover{border-color:var(--border-strong);color:var(--text-strong)}.requirement-reasons{padding:0 14px 10px}.requirement-reasons p{display:flex;align-items:flex-start;gap:6px;margin:5px 0;color:var(--danger);font-size:9px}.commit-list{overflow:hidden;border:1px solid var(--border);border-radius:8px;background:var(--surface)}.commit-list>article{position:relative;display:grid;grid-template-columns:30px 1fr auto;align-items:center;gap:9px;min-height:58px;padding:8px 12px;border-top:1px solid var(--border-subtle);color:inherit}.commit-list>article:first-child{border:0}.commit-list>article:hover{background:var(--surface-hover)}.commit-mark{display:grid;width:28px;height:28px;place-items:center;border-radius:50%;background:var(--surface-muted);color:var(--text-muted)}.commit-list .commit-title,.commit-list small{display:block}.commit-list .commit-title{color:var(--text-strong);font-size:11px;font-weight:650;text-decoration:none}.commit-list .commit-title::after{position:absolute;z-index:0;inset:0;content:''}.commit-list small{display:flex;align-items:center;gap:3px;margin-top:3px;color:var(--text-faint);font-size:9px}.commit-list small :global(.user-profile-link){position:relative;z-index:1;color:var(--text-muted);font-size:9px}.commit-list small i{display:inline-flex;align-items:center;gap:3px;margin-left:7px;color:var(--success);font-style:normal;font-weight:650}.commit-list code{color:var(--text-muted);font-size:9px}.commit-list>div{padding:45px;text-align:center}.commit-list>div strong{font-size:12px}.commit-list>div p{color:var(--text-faint);font-size:10px}
  .changes-view{min-height:calc(100dvh - 64px);scroll-margin-top:64px}.changes-head{display:flex;min-height:54px;align-items:center;justify-content:space-between;gap:14px;margin-bottom:12px;padding:0 12px;border:1px solid var(--border);border-radius:8px;background:var(--surface)}.changes-head>div:first-child strong,.changes-head>div:first-child span{display:block}.changes-head>div:first-child strong{color:var(--text-strong);font-size:11px}.changes-head>div:first-child span{margin-top:3px;color:var(--text-faint);font-size:9px}
  .checks-page{overflow:hidden;border:1px solid var(--border);border-radius:9px;background:var(--surface)}.checks-page>header{padding:14px;border-bottom:1px solid var(--border);background:var(--surface-muted)}.checks-page h2{margin:0;color:var(--text-strong);font-size:12px}.checks-page header p{margin:4px 0 0;color:var(--text-faint);font-size:9px}.checks-page article{display:grid;grid-template-columns:32px 1fr auto;align-items:center;gap:10px;min-height:65px;padding:10px 13px;border-top:1px solid var(--border-subtle)}.check-icon{display:grid;width:30px;height:30px;place-items:center;border-radius:7px}.check-icon.success{background:var(--success-soft);color:var(--success)}.check-icon.failure{background:var(--danger-soft);color:var(--danger)}.check-icon.running,.check-icon.queued{background:var(--brand-soft);color:var(--brand)}.checks-page article strong{color:var(--text-strong);font-size:11px}.checks-page article p{margin:3px 0 0;color:var(--text-faint);font-size:9px}.checks-page article>span:last-child{color:var(--text-muted);font-size:9px;text-transform:capitalize}.empty-checks{padding:50px 20px;color:var(--text-faint);text-align:center}.empty-checks strong{display:block;margin-top:9px;color:var(--text-strong);font-size:12px}.empty-checks p{font-size:10px}
  .details-editor{display:grid;gap:14px}.details-editor label>span{display:block;margin-bottom:6px;color:var(--text-muted);font-size:9px;font-weight:620}.details-editor input{width:100%;height:38px;padding:0 10px;border:1px solid var(--border);border-radius:7px;outline:0;background:var(--surface);color:var(--text-strong);font-size:11px}.details-editor input:focus{border-color:var(--brand)}
  @media(max-width:900px){.conversation-layout{grid-template-columns:1fr}.sidebar{position:static;grid-row:1}}
  @media(max-width:600px){.title-row{display:block}.state{margin-bottom:8px}.title-row h1{font-size:20px}.tabs button{padding:0 8px}.tabs button span{display:none}.conversation-layout{gap:12px}}
</style>
