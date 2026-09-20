<script lang="ts">
  import { page } from '$app/stores';
  import { tick } from 'svelte';
  import type { IssueComment, IssueDetail, IssueEvent, IssueLabel, IssueTimelineItem, IssueTimelineWindow } from '@marl/contracts';
  import ArrowDown from 'lucide-svelte/icons/arrow-down';
  import Bell from 'lucide-svelte/icons/bell';
  import BellOff from 'lucide-svelte/icons/bell-off';
  import ChevronDown from 'lucide-svelte/icons/chevron-down';
  import CircleAlert from 'lucide-svelte/icons/circle-alert';
  import Pencil from 'lucide-svelte/icons/pencil';
  import X from 'lucide-svelte/icons/x';
  import Button from '$lib/components/Button.svelte';
  import MarkdownBody from '$lib/components/MarkdownBody.svelte';
  import MarkdownComposer from '$lib/components/MarkdownComposer.svelte';
  import Modal from '$lib/components/Modal.svelte';
  import ReferenceTimelineEvent from '$lib/components/ReferenceTimelineEvent.svelte';
  import Seo from '$lib/components/Seo.svelte';
  import Time from '$lib/components/Time.svelte';
  import UserProfileLink from '$lib/components/UserProfileLink.svelte';
  import IssuePullLinks from '$lib/issues/IssuePullLinks.svelte';
  import IssueConclusion from '$lib/issues/IssueConclusion.svelte';
  import IssueDiscussionThread from '$lib/issues/IssueDiscussionThread.svelte';
  import IssueMetadata from '$lib/issues/IssueMetadata.svelte';
  import { isDiscussionEvent, issueDiscussion, issueEventCopy, observeIssueDiscussion } from '$lib/issues/issue-discussion';
  import { api, MarlApiError } from '$lib/api';
  import { seoExcerpt } from '$lib/seo';

  let { data } = $props<{ data: { issue: IssueDetail; repository: { visibility: string }; shellUser: { id: string } | null } }>();
  const owner = $derived($page.params.owner ?? '');
  const repo = $derived($page.params.repo ?? '');
  const number = $derived(Number($page.params.number));
  const context = $derived({ owner, repository: repo });
  const endpoint = $derived(`/repositories/${owner}/${repo}/issues/${number}`);
  let issue = $derived<IssueDetail>(data.issue);
  let timeline = $derived<IssueTimelineWindow>(data.issue.timeline);
  const discussion = $derived(issueDiscussion(timeline));
  const history = $derived(timeline.items.filter((item) => item.kind === 'event' && !isDiscussionEvent(item.value)));
  const comments = $derived(new Map([...timeline.context, ...timeline.items.flatMap((item) => item.kind === 'comment' ? [item.value] : [])].map((item) => [item.id, item])));
  const canReply = $derived(Boolean(data.shellUser) && (!issue.locked || issue.canManage));
  const draftKey = $derived(data.shellUser ? `issue:${issue.id}:${data.shellUser.id}` : undefined);
  const resumeSequence = $derived(data.issue.participation.lastReadSequence);
  const hasUnread = $derived(resumeSequence > 0 && timeline.items.some((item) => item.sequence > resumeSequence));
  let comment = $state('');
  let uploading = $state(false);
  let editUploading = $state(false);
  let busy = $state(false);
  let error = $state('');
  let editing = $state(false);
  let editedTitle = $state('');
  let editedBody = $state('');
  let reportExpanded = $state(false);
  let reportOverflow = $state(false);
  let historyOpen = $state(false);
  let detailsOpen = $state(false);
  let conclusionEditor = $state<IssueConclusion>();
  let pendingRead = 0;
  let reading = false;

  async function run(action: () => Promise<void>) {
    if (busy) return false;
    busy = true;
    error = '';
    try { await action(); return true; }
    catch (cause) { error = cause instanceof MarlApiError ? cause.message : 'The issue could not be updated.'; return false; }
    finally { busy = false; }
  }
  function append(kind: 'comment' | 'event', value: IssueComment | IssueEvent, sequence: number) {
    timeline = { ...timeline, items: [...timeline.items, { sequence, kind, createdAt: value.createdAt, value } as IssueTimelineItem], total: timeline.total + 1 };
  }
  function appendEvents(items: Array<{ kind: 'event'; value: IssueEvent; sequence: number }>) {
    for (const item of items) append('event', item.value, item.sequence);
  }
  async function addComment(body: string, replyToId?: string) {
    if (!body.trim()) return false;
    return run(async () => {
      const result = await api<{ comment: IssueComment; sequence: number; linkedItems: IssueDetail['linkedItems'] }>(`${endpoint}/comments`, { method: 'POST', body: JSON.stringify({ body: body.trim(), replyToId }) });
      append('comment', result.comment, result.sequence);
      issue = { ...issue, linkedItems: result.linkedItems, commentCount: issue.commentCount + 1, updatedAt: result.comment.createdAt };
    });
  }
  function updateComment(id: string, patch: Partial<IssueComment>) {
    timeline = {
      ...timeline,
      items: timeline.items.map((item) => item.kind === 'comment' && item.value.id === id ? { ...item, value: { ...item.value, ...patch } } : item),
      context: timeline.context.map((item) => item.id === id ? { ...item, ...patch } : item)
    };
  }
  async function saveComment(id: string, body: string) {
    if (!body.trim()) return false;
    return run(async () => {
      const result = await api<{ comment: { body: string; updatedAt: string }; linkedItems: IssueDetail['linkedItems'] }>(`/issue-comments/${id}`, { method: 'PATCH', body: JSON.stringify({ body: body.trim() }) });
      updateComment(id, result.comment);
      issue = { ...issue, linkedItems: result.linkedItems };
    });
  }
  async function deleteComment(id: string) {
    return run(async () => {
      const result = await api<{ updatedAt: string; linkedItems: IssueDetail['linkedItems'] }>(`/issue-comments/${id}`, { method: 'DELETE' });
      updateComment(id, { body: '', deleted: true, updatedAt: result.updatedAt });
      issue = { ...issue, linkedItems: result.linkedItems, commentCount: Math.max(0, issue.commentCount - 1) };
    });
  }
  async function changeState() {
    await run(async () => {
      const state = issue.state === 'open' ? 'closed' : 'open';
      const result = await api<{ state: 'open' | 'closed'; timeline: { kind: 'event'; value: IssueEvent; sequence: number } }>(`${endpoint}/state`, { method: 'POST', body: JSON.stringify({ state }) });
      issue = { ...issue, state: result.state };
      append('event', result.timeline.value, result.timeline.sequence);
    });
  }
  function openEditor() { editedTitle = issue.title; editedBody = issue.body; editing = true; }
  async function saveDetails() {
    if (editedTitle.trim().length < 3 || editUploading) return;
    await run(async () => {
      const result = await api<{ issue: { title: string; body: string }; linkedItems: IssueDetail['linkedItems']; timeline: Array<{ kind: 'event'; value: IssueEvent; sequence: number }> }>(endpoint, { method: 'PATCH', body: JSON.stringify({ title: editedTitle, body: editedBody }) });
      issue = { ...issue, ...result.issue, linkedItems: result.linkedItems };
      appendEvents(result.timeline);
      editedBody = '';
      await tick();
      editing = false;
    });
  }
  async function updateMetadata(body: { assigneeIds?: string[]; labelIds?: string[]; locked?: boolean }) {
    await run(async () => {
      const result = await api<{ timeline: Array<{ kind: 'event'; value: IssueEvent; sequence: number }> }>(`${endpoint}/metadata`, { method: 'PATCH', body: JSON.stringify(body) });
      issue = {
        ...issue,
        ...(body.assigneeIds ? { assignees: issue.availableAssignees.filter((person) => body.assigneeIds?.includes(person.id)) } : {}),
        ...(body.labelIds ? { labels: issue.availableLabels.filter((label) => body.labelIds?.includes(label.id)) } : {}),
        ...(body.locked !== undefined ? { locked: body.locked } : {})
      };
      appendEvents(result.timeline);
    });
  }
  async function createLabel(name: string) {
    await run(async () => {
      const result = await api<{ label: IssueLabel }>(`${endpoint}/labels`, { method: 'POST', body: JSON.stringify({ name }) });
      if (!issue.availableLabels.some((label) => label.id === result.label.id)) issue = { ...issue, availableLabels: [...issue.availableLabels, result.label].toSorted((left, right) => left.name.localeCompare(right.name)) };
    });
  }
  async function loadOlder() {
    if (!timeline.loadBeforeSequence || timeline.firstBoundarySequence === undefined) return false;
    return run(async () => {
      const result = await api<{ timeline: IssueTimelineWindow }>(`${endpoint}/timeline?before=${timeline.loadBeforeSequence}&after=${timeline.firstBoundarySequence}`);
      const items = [...timeline.items, ...result.timeline.items];
      timeline = {
        ...timeline,
        items: [...new Map(items.map((item) => [item.sequence, item])).values()].toSorted((left, right) => left.sequence - right.sequence),
        context: [...new Map([...timeline.context, ...result.timeline.context].map((item) => [item.id, item])).values()],
        hidden: result.timeline.hidden,
        loadBeforeSequence: result.timeline.loadBeforeSequence
      };
    });
  }
  async function saveConclusion(body: string, commentId: string | null) {
    return run(async () => {
      const result = await api<{ conclusion: IssueDetail['conclusion'] }>(`${endpoint}/conclusion`, { method: 'PATCH', body: JSON.stringify({ body: body.trim(), commentId }) });
      issue = { ...issue, conclusion: result.conclusion };
    });
  }
  async function linkPull(pullNumber: number) {
    return run(async () => {
      const result = await api<{ linkedItems: IssueDetail['linkedItems'] }>(`${endpoint}/links`, { method: 'POST', body: JSON.stringify({ pullNumber }) });
      issue = { ...issue, linkedItems: result.linkedItems };
    });
  }
  async function toggleFollowing() {
    await run(async () => {
      const result = await api<{ participation: IssueDetail['participation'] }>(`${endpoint}/participation`, { method: 'PATCH', body: JSON.stringify({ following: !issue.participation.following }) });
      issue = { ...issue, participation: { ...result.participation, lastReadSequence: Math.max(issue.participation.lastReadSequence, result.participation.lastReadSequence) }, following: result.participation.following };
    });
  }
  async function markRead(sequence: number) {
    if (!data.shellUser) return;
    const limit = timeline.hidden > 0 && issue.participation.lastReadSequence < (timeline.loadBeforeSequence ?? 0) - 1 ? timeline.firstBoundarySequence ?? 0 : Infinity;
    pendingRead = Math.max(pendingRead, Math.min(sequence, limit));
    if (reading || pendingRead <= issue.participation.lastReadSequence) return;
    reading = true;
    const issueId = issue.id;
    try {
      while (issue.id === issueId && pendingRead > issue.participation.lastReadSequence) {
        const result = await api<{ participation: IssueDetail['participation'] }>(`${endpoint}/participation`, { method: 'PATCH', body: JSON.stringify({ lastReadSequence: pendingRead }) });
        if (issue.id === issueId) issue = { ...issue, participation: { ...issue.participation, lastReadSequence: Math.max(issue.participation.lastReadSequence, result.participation.lastReadSequence) } };
      }
    } catch { if (issue.id === issueId) error = 'Your reading position could not be saved.'; }
    finally { reading = false; }
  }
  function scrollToComment(id: string) {
    const element = document.getElementById(`comment-${id}`);
    element?.scrollIntoView({ block: 'start', behavior: 'instant' });
    element?.focus({ preventScroll: true });
    return Boolean(element);
  }
  async function showSource(id: string) {
    while (!document.getElementById(`comment-${id}`) && timeline.hidden > 0) {
      if (!await loadOlder()) return;
      await tick();
    }
    if (!scrollToComment(id)) error = 'This comment is no longer available.';
  }
  async function resume() {
    while (timeline.hidden > 0 && resumeSequence < (timeline.loadBeforeSequence ?? 0) - 1) {
      if (!await loadOlder()) return;
    }
    await tick();
    const next = timeline.items.find((item) => item.sequence > resumeSequence && (item.kind !== 'event' || isDiscussionEvent(item.value)));
    if (next) scrollToItem(next);
  }
  function scrollToItem(item: IssueTimelineItem) {
    if (item.kind === 'comment') scrollToComment(item.value.id);
    else document.getElementById(`activity-${item.sequence}`)?.scrollIntoView({ block: 'center', behavior: 'instant' });
  }
  function latest() {
    const item = timeline.items.findLast((item) => item.kind !== 'event' || isDiscussionEvent(item.value));
    if (item) scrollToItem(item);
    else document.getElementById('issue-composer')?.scrollIntoView({ block: 'center', behavior: 'instant' });
  }
  function measureReport(node: HTMLElement) {
    const measure = () => { if (!reportExpanded) reportOverflow = node.scrollHeight > node.clientHeight + 1; };
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    const markdown = node.querySelector('.markdown');
    if (markdown) observer.observe(markdown);
    return () => observer.disconnect();
  }
</script>

<Seo title={`${issue.title} · #${issue.number} · ${owner}/${repo} · Marl`} description={seoExcerpt(issue.body, `${issue.title} — issue #${issue.number} in ${owner}/${repo}.`)} path={$page.url.pathname} robots={data.repository.visibility === 'public' ? 'index, follow' : 'noindex, nofollow'} />

<header class="issue-header">
  <h1>{issue.title} <span>#{issue.number}</span></h1>
  <div class="header-details"><span class="issue-state" class:closed={issue.state === 'closed'}><i></i>{issue.state === 'open' ? 'Open' : 'Closed'}</span><span>{issue.commentCount} {issue.commentCount === 1 ? 'comment' : 'comments'}</span>{#if data.shellUser}<Button class="follow" size="small" variant="ghost" disabled={busy} aria-pressed={issue.participation.following} onclick={toggleFollowing}>{#if issue.participation.following}<BellOff size={13} />Following{:else}<Bell size={13} />Follow{/if}</Button>{/if}</div>
</header>

{#if error}<div class="action-error" role="alert"><CircleAlert size={15} /><span>{error}</span><Button icon size="small" variant="ghost" aria-label="Dismiss error" onclick={() => (error = '')}><X size={13} /></Button></div>{/if}

<div class="issue-layout">
  <main {@attach (node) => observeIssueDiscussion(node, markRead)}>
    <article class="opening-post">
      <header><UserProfileLink handle={issue.author} displayName={issue.authorDisplayName} avatarUrl={issue.authorAvatarUrl} size={30} /><Time value={issue.createdAt} />{#if issue.canEdit}<Button size="small" variant="ghost" onclick={openEditor}><Pencil size={13} />Edit</Button>{/if}</header>
      <div class="report" class:expanded={reportExpanded} {@attach measureReport}><MarkdownBody source={issue.body || 'No description provided.'} {context} --markdown-font-size="14px" /></div>
      {#if reportOverflow}<Button class="expand-report" size="small" variant="ghost" aria-expanded={reportExpanded} onclick={() => (reportExpanded = !reportExpanded)}>{reportExpanded ? 'Show less' : 'Read full description'}<ChevronDown size={13} style={reportExpanded ? 'transform:rotate(180deg)' : undefined} /></Button>{/if}
    </article>

    <section class="discussion" aria-labelledby="discussion-title">
      <header><h2 id="discussion-title">Discussion</h2><div>{#if hasUnread}<Button size="small" variant="ghost" disabled={busy} onclick={resume}>Resume</Button>{/if}{#if discussion.length}<Button size="small" variant="ghost" onclick={latest}>Latest<ArrowDown size={13} /></Button>{/if}</div></header>
      {#if timeline.hidden > 0}<Button class="older" block variant="ghost" loading={busy} onclick={loadOlder}>Load earlier discussion <span>{timeline.hidden} updates</span></Button>{/if}
      <div class="timeline">
        {#each discussion as item (item.kind === 'thread' ? item.id : item.sequence)}
          {#if item.kind === 'thread'}<IssueDiscussionThread thread={item} {context} {canReply} canConclude={issue.canConclude} {busy} {comments} {draftKey} onSave={saveComment} onDelete={deleteComment} onReply={addComment} onSource={showSource} onConclude={(selected) => { detailsOpen = true; conclusionEditor?.promote(selected); }} />
          {:else if item.kind === 'reference'}<div id={`activity-${item.sequence}`}><ReferenceTimelineEvent reference={item.value} /><span class="read-marker" data-read-sequence={item.sequence} aria-hidden="true"></span></div>
          {:else}<article id={`activity-${item.sequence}`} class="event"><p><UserProfileLink handle={item.value.actor} displayName={item.value.actorDisplayName} avatar={false} /> {issueEventCopy(item.value)} {#if item.value.kind === 'closed_by_pull'}<a href="/{item.value.details.owner}/{item.value.details.repository}/pulls/{item.value.details.number}">{item.value.details.owner}/{item.value.details.repository}!{item.value.details.number}</a>{/if}</p><Time value={item.createdAt} /><span class="read-marker" data-read-sequence={item.sequence} aria-hidden="true"></span></article>{/if}
        {/each}
      </div>
      {#if canReply}<section id="issue-composer" class="new-comment"><MarkdownComposer bind:value={comment} bind:uploading {context} disabled={busy || !canReply} draftKey={draftKey ? `${draftKey}:comment` : undefined} placeholder={discussion.length ? 'Add to the discussion' : 'What do you think?'} minHeight={120} /><footer><Button variant="primary" disabled={busy || uploading || !comment.trim()} onclick={async () => { if (await addComment(comment)) comment = ''; }}>Comment</Button></footer></section>
      {:else if issue.locked}<p class="quiet">This discussion is locked.</p>
      {:else}<p class="quiet"><a href="/sign-in">Sign in</a> to join the discussion.</p>{/if}
      {#if history.length}<section class="history"><Button class="history-toggle" size="small" variant="ghost" aria-expanded={historyOpen} onclick={() => (historyOpen = !historyOpen)}>History <span>{history.length}</span><ChevronDown size={13} style={historyOpen ? 'transform:rotate(180deg)' : undefined} /></Button>{#if historyOpen}<div>{#each history as item (item.sequence)}{#if item.kind === 'event'}<article class="event"><p><UserProfileLink handle={item.value.actor} displayName={item.value.actorDisplayName} avatar={false} /> {issueEventCopy(item.value)}</p><Time value={item.createdAt} /><span class="read-marker" data-read-sequence={item.sequence} aria-hidden="true"></span></article>{/if}{/each}</div>{/if}</section>{/if}
    </section>
  </main>
  <aside>
    <Button class="details-toggle" variant="ghost" aria-expanded={detailsOpen} aria-controls="issue-details" onclick={() => (detailsOpen = !detailsOpen)}>Issue details<ChevronDown size={15} style={detailsOpen ? 'transform:rotate(180deg)' : undefined} /></Button>
    <div id="issue-details" class="details-content" class:expanded={detailsOpen}>
      <IssueConclusion bind:this={conclusionEditor} conclusion={issue.conclusion} canEdit={issue.canConclude} {busy} {context} {draftKey} onSave={saveConclusion} onSource={showSource} />
      <IssuePullLinks items={issue.linkedItems} {context} canLink={issue.canEdit || issue.canManage} onLink={linkPull} />
      <IssueMetadata {issue} {busy} onUpdate={updateMetadata} onCreateLabel={createLabel} />
      {#if issue.canEdit}<div class="state-action"><Button size="small" disabled={busy} onclick={changeState}>{issue.state === 'open' ? 'Close issue' : 'Reopen issue'}</Button></div>{/if}
    </div>
  </aside>
</div>

<Modal open={editing} title="Edit issue" --modal-width="720px" onClose={() => { if (!editUploading) editing = false; }}>
  {#snippet children()}<div class="editor"><label><span>Title</span><input bind:value={editedTitle} maxlength="240" disabled={busy} /></label><div><span class="field-label">Description</span><MarkdownComposer bind:value={editedBody} bind:uploading={editUploading} {context} disabled={busy} draftKey={draftKey ? `${draftKey}:description` : undefined} minHeight={200} /></div></div>{/snippet}
  {#snippet actions()}<Button size="small" disabled={editUploading} onclick={() => (editing = false)}>Cancel</Button><Button size="small" variant="primary" loading={busy} disabled={editUploading || editedTitle.trim().length < 3} onclick={saveDetails}>Save changes</Button>{/snippet}
</Modal>

<style>
  .issue-header{padding:3px 0 24px}
  h1{max-width:1000px;margin:0;color:var(--text-strong);font-size:28px;font-weight:670;letter-spacing:-.035em;line-height:1.25;text-wrap:balance}
  h1>span{color:var(--text-faint);font-size:19px;font-weight:500;white-space:nowrap}
  .header-details{display:flex;align-items:center;flex-wrap:wrap;gap:10px 18px;margin-top:12px;color:var(--text-muted);font-size:12px}
  .issue-state{display:flex;align-items:center;gap:7px;color:var(--text-strong);font-weight:620}
  .issue-state i{width:7px;height:7px;border-radius:50%;background:var(--success)}
  .issue-state.closed i{background:var(--text-faint)}
  :global(.follow.button){height:30px;margin-left:auto;border-radius:999px;font-size:12px}
  .issue-layout{display:grid;grid-template-columns:minmax(0,1fr) 260px;align-items:start;gap:36px}
  main,.discussion{min-width:0}
  .opening-post{padding:20px 22px;border-radius:12px;background:var(--surface);box-shadow:var(--shadow-surface)}
  .opening-post>header{display:flex;align-items:center;flex-wrap:wrap;gap:8px 12px;margin-bottom:18px;color:var(--text-muted);font-size:12px}
  .opening-post>header :global(.user-profile-link){margin-right:auto;font-size:13px}
  .opening-post>header :global(time){font-size:11px}
  .report{max-height:480px;overflow:hidden}
  .report.expanded{max-height:none;overflow:visible}
  :global(.expand-report.button){margin:12px 0 -4px -8px;color:var(--brand)}
  .discussion{margin-top:28px}
  .discussion>header{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:14px}
  h2{margin:0;color:var(--text-strong);font-size:15px;font-weight:650}
  .discussion>header>div{display:flex;align-items:center;gap:4px}
  .timeline{display:grid;gap:16px}
  .timeline>div{scroll-margin-block:90px}
  .event{position:relative;display:flex;align-items:baseline;flex-wrap:wrap;gap:6px 14px;padding:9px 14px;color:var(--text-muted);font-size:12px;line-height:1.6;scroll-margin-block:90px}
  .event p{flex:1;min-width:180px;margin:0}
  .event :global(time){font-size:11px;white-space:nowrap}
  .event a,.quiet a{color:var(--brand);text-decoration:none}
  .event a:hover,.quiet a:hover{text-decoration:underline}
  .read-marker{display:block;height:1px;pointer-events:none}
  .event>.read-marker{position:absolute;bottom:0;left:0;width:1px}
  .new-comment{margin-top:18px;scroll-margin-block:90px}
  .new-comment>footer{display:flex;justify-content:flex-end;margin-top:10px}
  .quiet{margin:18px 0;color:var(--text-muted);font-size:13px}
  .history{margin-top:24px}
  :global(.history-toggle.button){gap:8px;margin-left:-8px;color:var(--text-muted)}
  .history :global(.history-toggle span){color:var(--text-faint);font-size:11px}
  .history>div{margin-top:8px;padding:6px;border-radius:9px;background:var(--surface-muted)}
  :global(.older.button){height:auto;min-height:42px;gap:10px;margin:0 0 14px;border-radius:999px;background:var(--surface-muted);font-size:12px}
  :global(.older.button span){color:var(--text-faint);font-size:11px}
  aside{position:sticky;top:82px;min-width:0}
  .details-content{display:grid;gap:24px}
  :global(.details-toggle.button){display:none}
  aside :global(.metadata){margin-top:0}
  aside :global(.field>header>span),aside :global(.lock>span){font-size:12px}
  aside :global(.people .user-profile-link),aside :global(.empty){font-size:12px}
  aside :global(.labels>span:not(.empty)){border-radius:999px;font-size:11px;padding:5px 9px}
  .state-action{padding-top:2px}
  .action-error{display:grid;grid-template-columns:18px minmax(0,1fr) 30px;align-items:center;gap:6px;margin:0 0 18px;padding:8px 8px 8px 11px;border-radius:8px;background:var(--danger-soft);color:var(--danger);font-size:12px}
  .editor{display:grid;gap:16px}
  .editor label>span,.field-label{display:block;margin-bottom:7px;color:var(--text-muted);font-size:12px;font-weight:620}
  .editor input{width:100%;height:42px;padding:0 12px;border:1px solid var(--border);border-radius:8px;outline:0;background:var(--surface);color:var(--text-strong);font-size:14px}
  .editor input:focus{border-color:var(--brand)}
  @media(min-width:1450px){.issue-layout{grid-template-columns:minmax(0,880px) minmax(240px,280px);justify-content:space-between;gap:48px}}
  @media(max-width:1000px){.issue-layout{grid-template-columns:minmax(0,1fr) 220px;gap:24px}}
  @media(max-width:760px){.issue-layout{grid-template-columns:1fr;gap:20px}aside{position:static;grid-row:1;padding:4px;border-radius:10px;background:var(--surface-muted)}.details-content{display:none}.details-content.expanded{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));align-items:start;padding:12px}:global(.details-toggle.button){display:flex;justify-content:space-between;width:100%;font-size:12px}h1{font-size:24px}.opening-post{padding:17px}.header-details{gap:10px 14px}}
  @media(max-width:480px){.details-content.expanded{grid-template-columns:1fr}h1>span{font-size:17px}.opening-post>header{gap:6px 10px}.issue-header{padding-bottom:20px}}
</style>
