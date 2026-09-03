<script lang="ts">
  import { page } from '$app/stores';
  import { untrack } from 'svelte';
  import type { IssueComment, IssueDetail, IssueEvent, IssueLabel, IssueTimelineItem, IssueTimelineWindow } from '@marl/contracts';
  import CircleAlert from 'lucide-svelte/icons/circle-alert';
  import CircleDot from 'lucide-svelte/icons/circle-dot';
  import CircleDotDashed from 'lucide-svelte/icons/circle-dot-dashed';
  import GitPullRequest from 'lucide-svelte/icons/git-pull-request';
  import Lock from 'lucide-svelte/icons/lock';
  import Pencil from 'lucide-svelte/icons/pencil';
  import Tag from 'lucide-svelte/icons/tag';
  import UserPlus from 'lucide-svelte/icons/user-plus';
  import X from 'lucide-svelte/icons/x';
  import Button from '$lib/components/Button.svelte';
  import MarkdownBody from '$lib/components/MarkdownBody.svelte';
  import MarkdownComposer from '$lib/components/MarkdownComposer.svelte';
  import Modal from '$lib/components/Modal.svelte';
  import ReferenceTimelineEvent from '$lib/components/ReferenceTimelineEvent.svelte';
  import Seo from '$lib/components/Seo.svelte';
  import Time from '$lib/components/Time.svelte';
  import UserProfileLink from '$lib/components/UserProfileLink.svelte';
  import WorkItemLinks from '$lib/components/WorkItemLinks.svelte';
  import IssueMetadata from '$lib/issues/IssueMetadata.svelte';
  import { issueDetailSignal } from '$lib/issues/issue-signal';
  import { api, MarlApiError } from '$lib/api';
  import { seoExcerpt } from '$lib/seo';
  import type { PageData } from './$types';

  let { data } = $props<{ data: PageData }>();
  const owner = $derived($page.params.owner ?? '');
  const repo = $derived($page.params.repo ?? '');
  const number = $derived(Number($page.params.number));
  const context = $derived({ owner, repository: repo });
  let issue = $derived<IssueDetail>(data.issue);
  let timeline = $derived<IssueTimelineWindow>(data.issue.timeline);
  const signal = $derived(issueDetailSignal(issue));
  const activePull = $derived(issue.linkedItems.find((item) => item.kind === 'pull' && !['merged', 'closed'].includes(item.state)));
  const workHref = $derived(activePull
    ? `/${activePull.repository.owner}/${activePull.repository.name}/pulls/${activePull.number}`
    : `/pulls/new?repository=${encodeURIComponent(`${owner}/${repo}`)}&issue=${issue.number}`);
  let comment = $state('');
  let busy = $state(false);
  let error = $state('');
  let editing = $state(false);
  let editedTitle = $state('');
  let editedBody = $state('');
  let editingComment = $state<string | null>(null);
  let editCommentBody = $state('');
  let confirmingDelete = $state<string | null>(null);

  $effect(() => {
    data.issue.id;
    untrack(() => {
      comment = '';
      busy = false;
      error = '';
      editing = false;
      editedTitle = '';
      editedBody = '';
      editingComment = null;
      editCommentBody = '';
      confirmingDelete = null;
    });
  });

  function append(kind: IssueTimelineItem['kind'], value: IssueComment | IssueEvent) {
    const sequence = Math.max(0, ...timeline.items.map((item) => item.sequence)) + 1;
    timeline = { ...timeline, items: [...timeline.items, { sequence, kind, createdAt: value.createdAt, value } as IssueTimelineItem], total: timeline.total + 1 };
  }
  function appendEvents(items: Array<{ kind: 'event'; value: IssueEvent }>) { for (const item of items) append('event', item.value); }
  async function run(action: () => Promise<void>) { if (busy) return; busy = true; error = ''; try { await action(); } catch (cause) { error = cause instanceof MarlApiError ? cause.message : 'The issue could not be updated.'; } finally { busy = false; } }
  async function addComment() { const body = comment.trim(); if (!body) return; await run(async () => { const result = await api<{ comment: IssueComment; linkedItems: IssueDetail['linkedItems'] }>(`/repositories/${owner}/${repo}/issues/${number}/comments`, { method: 'POST', body: JSON.stringify({ body }) }); append('comment', result.comment); comment = ''; issue = { ...issue, linkedItems: result.linkedItems, commentCount: issue.commentCount + 1, updatedAt: result.comment.createdAt }; }); }
  async function saveComment(id: string) { const body = editCommentBody.trim(); if (!body) return; await run(async () => { const result = await api<{ comment: { body: string; updatedAt: string }; linkedItems: IssueDetail['linkedItems'] }>(`/issue-comments/${id}`, { method: 'PATCH', body: JSON.stringify({ body }) }); timeline = { ...timeline, items: timeline.items.map((item) => item.kind === 'comment' && item.value.id === id ? { ...item, value: { ...item.value, ...result.comment } } : item) }; issue = { ...issue, linkedItems: result.linkedItems }; editingComment = null; }); }
  async function deleteComment(id: string) { await run(async () => { const result = await api<{ updatedAt: string; linkedItems: IssueDetail['linkedItems'] }>(`/issue-comments/${id}`, { method: 'DELETE' }); timeline = { ...timeline, items: timeline.items.map((item) => item.kind === 'comment' && item.value.id === id ? { ...item, value: { ...item.value, body: '', deleted: true, updatedAt: result.updatedAt } } : item) }; issue = { ...issue, linkedItems: result.linkedItems, commentCount: Math.max(0, issue.commentCount - 1) }; confirmingDelete = null; }); }
  async function changeState() { await run(async () => { const state = issue.state === 'open' ? 'closed' : 'open'; const result = await api<{ state: 'open' | 'closed'; timeline: { kind: 'event'; value: IssueEvent } }>(`/repositories/${owner}/${repo}/issues/${number}/state`, { method: 'POST', body: JSON.stringify({ state }) }); issue = { ...issue, state: result.state }; append('event', result.timeline.value); }); }
  function openEditor() { editedTitle = issue.title; editedBody = issue.body; editing = true; }
  async function saveDetails() { if (editedTitle.trim().length < 3) return; await run(async () => { const result = await api<{ issue: { title: string; body: string }; linkedItems: IssueDetail['linkedItems']; timeline: Array<{ kind: 'event'; value: IssueEvent }> }>(`/repositories/${owner}/${repo}/issues/${number}`, { method: 'PATCH', body: JSON.stringify({ title: editedTitle, body: editedBody }) }); issue = { ...issue, ...result.issue, linkedItems: result.linkedItems }; appendEvents(result.timeline); editing = false; }); }
  async function updateMetadata(body: { assigneeIds?: string[]; labelIds?: string[]; locked?: boolean }) { await run(async () => { const result = await api<{ timeline: Array<{ kind: 'event'; value: IssueEvent }> }>(`/repositories/${owner}/${repo}/issues/${number}/metadata`, { method: 'PATCH', body: JSON.stringify(body) }); issue = { ...issue, ...(body.assigneeIds ? { assignees: issue.availableAssignees.filter((person) => body.assigneeIds?.includes(person.id)) } : {}), ...(body.labelIds ? { labels: issue.availableLabels.filter((label) => body.labelIds?.includes(label.id)) } : {}), ...(body.locked !== undefined ? { locked: body.locked } : {}) }; appendEvents(result.timeline); }); }
  async function createLabel(name: string) { await run(async () => { const result = await api<{ label: IssueLabel }>(`/repositories/${owner}/${repo}/issues/${number}/labels`, { method: 'POST', body: JSON.stringify({ name }) }); if (!issue.availableLabels.some((label) => label.id === result.label.id)) issue = { ...issue, availableLabels: [...issue.availableLabels, result.label].toSorted((left, right) => left.name.localeCompare(right.name)) }; }); }
  async function loadOlder() { if (!timeline.loadBeforeSequence || timeline.firstBoundarySequence === undefined) return; await run(async () => { const result = await api<{ timeline: IssueTimelineWindow }>(`/repositories/${owner}/${repo}/issues/${number}/timeline?before=${timeline.loadBeforeSequence}&after=${timeline.firstBoundarySequence}`); const items = [...timeline.items, ...result.timeline.items]; timeline = { ...timeline, items: [...new Map(items.map((item) => [item.sequence, item])).values()].toSorted((left, right) => left.sequence - right.sequence), hidden: result.timeline.hidden, loadBeforeSequence: result.timeline.loadBeforeSequence }; }); }
  function eventCopy(event: IssueEvent) { if (event.kind === 'assigned') return `assigned @${event.details.handle}`; if (event.kind === 'unassigned') return `unassigned @${event.details.handle}`; if (event.kind === 'label_added') return `added ${event.details.label}`; if (event.kind === 'label_removed') return `removed ${event.details.label}`; if (event.kind === 'closed_by_pull') return 'closed this issue via'; return ({ title_changed: 'changed the title', description_changed: 'edited the description', locked: 'locked the conversation', unlocked: 'unlocked the conversation', closed: 'closed this issue', reopened: 'reopened this issue' } as Record<string, string>)[event.kind] ?? event.kind; }
</script>

<Seo title={`${issue.title} · #${issue.number} · ${owner}/${repo} · Marl`} description={seoExcerpt(issue.body, `${issue.title} — issue #${issue.number} in ${owner}/${repo}.`)} path={$page.url.pathname} robots={data.repository.visibility === 'public' ? 'index, follow' : 'noindex, nofollow'} />

<header class="issue-header">
  <p class="route-context"><a href="/{owner}/{repo}">{owner}/{repo}</a> · Issue #{issue.number}</p>
  <div class="title-row">
    <span class:closed={issue.state === 'closed'} class="state-icon" aria-label={issue.state}>{#if issue.state === 'closed'}<CircleDotDashed size={20} />{:else}<CircleDot size={20} />{/if}</span>
    <h1>{issue.title}</h1>
    {#if issue.canEdit}<Button size="small" variant="ghost" onclick={openEditor}><Pencil size={13} />Edit</Button>{/if}
  </div>
  <p class="issue-meta"><UserProfileLink handle={issue.author} displayName={issue.authorDisplayName} avatar={false} /> opened this <Time value={issue.createdAt} /> · {issue.commentCount} {issue.commentCount === 1 ? 'comment' : 'comments'}</p>
</header>

<section class="work-motion {signal.tone}" aria-label="Current issue state">
  <span class="motion-icon">{#if activePull}<GitPullRequest size={18} />{:else if issue.state === 'closed'}<CircleDotDashed size={18} />{:else}<CircleDot size={18} />{/if}</span>
  <div><small>Current motion</small><strong>{signal.label}</strong><p>{signal.detail}</p></div>
  {#if activePull || (issue.state === 'open' && data.shellUser)}<a class="motion-action" href={workHref}>{activePull ? 'View pull' : 'Open a pull'}<GitPullRequest size={14} /></a>{/if}
</section>

{#if error}<div class="action-error" role="alert"><CircleAlert size={15} /><span>{error}</span><Button icon size="small" variant="ghost" aria-label="Dismiss error" onclick={() => (error = '')}><X size={13} /></Button></div>{/if}

<div class="work-layout">
  <main>
    <article class="brief">
      <header><h2>Work brief</h2>{#if issue.canEdit}<Button size="small" variant="ghost" onclick={openEditor}><Pencil size={13} />Edit brief</Button>{/if}</header>
      <div class="brief-body"><MarkdownBody source={issue.body || 'No work brief was provided.'} {context} /></div>
    </article>

    <section class="activity">
      <header><h2>Activity</h2></header>
      <div class="timeline">
        {#each timeline.items as item, index (item.sequence)}
          {#if timeline.hidden > 0 && index === 2}<Button class="older" block variant="ghost" loading={busy} onclick={loadOlder}>{timeline.hidden} earlier {timeline.hidden === 1 ? 'event' : 'events'} · Load more</Button>{/if}
          {#if item.kind === 'event'}
            <article class="event"><span class="event-icon">{#if item.value.kind.startsWith('label')}<Tag size={14} />{:else if item.value.kind.includes('assign')}<UserPlus size={14} />{:else if item.value.kind.includes('lock')}<Lock size={14} />{:else}<CircleDot size={14} />{/if}</span><p><UserProfileLink handle={item.value.actor} displayName={item.value.actorDisplayName} avatar={false} /> {eventCopy(item.value)} {#if item.value.kind === 'closed_by_pull'}<a class="work-reference" href="/{item.value.details.owner}/{item.value.details.repository}/pulls/{item.value.details.number}">{item.value.details.owner}/{item.value.details.repository}!{item.value.details.number}</a>{/if} <Time value={item.value.createdAt} /></p></article>
          {:else if item.kind === 'reference'}
            <ReferenceTimelineEvent reference={item.value} />
          {:else}
            <article class="comment">
              <header><UserProfileLink handle={item.value.author} displayName={item.value.authorDisplayName} avatarUrl={item.value.authorAvatarUrl} size={25} /><span>commented</span><Time class="end" value={item.value.createdAt} />{#if item.value.canEdit && !item.value.deleted}<div class="comment-actions">{#if confirmingDelete === item.value.id}<Button size="small" variant="danger-soft" onclick={() => deleteComment(item.value.id)}>Delete</Button><Button size="small" variant="ghost" onclick={() => (confirmingDelete = null)}>Cancel</Button>{:else}<Button size="small" variant="ghost" onclick={() => { editingComment = item.value.id; editCommentBody = item.value.body; }}>Edit</Button><Button size="small" variant="ghost" onclick={() => (confirmingDelete = item.value.id)}>Delete</Button>{/if}</div>{/if}</header>
              <div>{#if item.value.deleted}<p class="deleted">Comment deleted</p>{:else if editingComment === item.value.id}<MarkdownComposer bind:value={editCommentBody} {context} minHeight={80} /><footer><Button size="small" onclick={() => (editingComment = null)}>Cancel</Button><Button size="small" variant="primary" disabled={busy || !editCommentBody.trim()} onclick={() => saveComment(item.value.id)}>Save</Button></footer>{:else}<MarkdownBody source={item.value.body} {context} />{/if}</div>
            </article>
          {/if}
        {/each}
        {#if timeline.items.length === 0}<p class="quiet-activity">No activity yet. The work brief is the current source of truth.</p>{/if}
      </div>
      {#if data.shellUser}<section class="composer"><MarkdownComposer bind:value={comment} {context} placeholder={issue.locked && !issue.canManage ? 'This conversation is locked' : 'Leave an update or record a decision'} minHeight={110} /><footer>{#if issue.canEdit}<Button disabled={busy} onclick={changeState}>{issue.state === 'open' ? 'Close issue' : 'Reopen issue'}</Button>{/if}<Button variant="primary" loading={busy} disabled={!comment.trim() || (issue.locked && !issue.canManage)} onclick={addComment}>Add update</Button></footer></section>{/if}
    </section>
  </main>
  <aside><WorkItemLinks items={issue.linkedItems} /><IssueMetadata {issue} {busy} onUpdate={updateMetadata} onCreateLabel={createLabel} /></aside>
</div>

<Modal open={editing} title="Edit issue" description="Keep the work brief current as decisions change." onClose={() => (editing = false)}>{#snippet children()}<div class="editor"><label><span>Title</span><input bind:value={editedTitle} maxlength="240" /></label><label><span>Work brief</span><MarkdownComposer bind:value={editedBody} {context} minHeight={160} /></label></div>{/snippet}{#snippet actions()}<Button size="small" onclick={() => (editing = false)}>Cancel</Button><Button size="small" variant="primary" loading={busy} disabled={editedTitle.trim().length < 3} onclick={saveDetails}>Save changes</Button>{/snippet}</Modal>

<style>
  .issue-header{padding:4px 0 18px}.route-context{margin:0 0 9px;color:var(--text-faint);font-size:9px}.route-context a{color:inherit;text-decoration:none}.route-context a:hover{color:var(--text-strong)}.title-row{display:grid;grid-template-columns:28px minmax(0,1fr) auto;align-items:start;gap:8px}.title-row h1{margin:0;color:var(--text-strong);font-size:25px;font-weight:670;letter-spacing:-.03em;line-height:1.18}.state-icon{display:grid;height:29px;place-items:center;color:var(--success)}.state-icon.closed{color:var(--text-faint)}.issue-meta{margin:9px 0 0 36px;color:var(--text-muted);font-size:10px}.work-motion{display:grid;grid-template-columns:40px minmax(0,1fr) auto;align-items:center;gap:10px;margin:2px 0 30px;padding:8px 3px}.motion-icon{display:grid;width:36px;height:36px;place-items:center;border-radius:9px;background:var(--surface-muted);color:var(--text-muted)}.work-motion.working .motion-icon{background:var(--brand-soft);color:var(--brand)}.work-motion.attention .motion-icon{background:var(--danger-soft);color:var(--danger)}.work-motion.complete .motion-icon{background:var(--success-soft);color:var(--success)}.work-motion small,.work-motion strong,.work-motion p{display:block}.work-motion small{color:var(--text-faint);font-size:8px}.work-motion strong{margin-top:2px;color:var(--text-strong);font-size:13px;font-weight:670}.work-motion p{margin:2px 0 0;color:var(--text-muted);font-size:9px}.motion-action{display:inline-flex;height:31px;align-items:center;gap:7px;padding:0 10px;border:1px solid var(--border);border-radius:6px;color:var(--text-strong);font-size:10px;font-weight:630;text-decoration:none}.motion-action:hover{border-color:var(--border-strong);background:var(--surface-hover)}.work-layout{display:grid;grid-template-columns:minmax(0,1fr) 270px;align-items:start;gap:28px}.brief>header,.activity>header{display:flex;align-items:flex-start;justify-content:space-between;gap:14px}.brief h2,.activity h2{margin:0;color:var(--text-strong);font-size:12px;font-weight:670}.brief-body{padding:18px 0 4px}.activity{padding-top:40px}.timeline{display:grid;gap:12px;padding-top:14px}.comment{overflow:hidden;border:1px solid var(--border);border-radius:8px;background:var(--surface);content-visibility:auto;contain-intrinsic-size:auto 120px}.comment>header{display:flex;align-items:center;gap:6px;min-height:43px;padding:0 11px;border-bottom:1px solid var(--border-subtle);background:var(--surface-muted);color:var(--text-muted);font-size:10px}.comment>div{padding:17px}.comment footer,.composer>footer{display:flex;justify-content:flex-end;gap:6px;margin-top:10px}:global(.end){margin-left:auto}.comment-actions{display:flex;gap:3px;margin-left:6px}.deleted,.quiet-activity{margin:0;color:var(--text-faint);font-size:10px;font-style:italic}.quiet-activity{padding:18px 2px;font-style:normal}.event{display:grid;grid-template-columns:28px 1fr;align-items:center;gap:8px;padding:3px 7px}.event-icon{display:grid;width:27px;height:27px;place-items:center;border-radius:50%;background:var(--surface-muted);color:var(--text-muted)}.event p{margin:0;color:var(--text-muted);font-size:10px}.event p :global(.user-profile-link){font-size:10px}.work-reference{color:var(--text-strong);font-weight:650;text-decoration:none}.work-reference:hover{text-decoration:underline}.composer{padding-top:16px}.composer>footer{margin-top:8px}.action-error{display:grid;grid-template-columns:18px minmax(0,1fr) 30px;align-items:center;gap:6px;margin:-10px 0 14px;padding:8px 8px 8px 11px;border-left:2px solid var(--danger);border-radius:0 6px 6px 0;background:var(--danger-soft);color:var(--danger);font-size:10px}.timeline :global(.older.button){height:auto;min-height:36px;background:var(--surface-muted);font-size:9px}.editor{display:grid;gap:14px}.editor label>span{display:block;margin-bottom:6px;color:var(--text-muted);font-size:9px;font-weight:620}.editor input{width:100%;height:38px;padding:0 10px;border:1px solid var(--border);border-radius:7px;outline:0;background:var(--surface);color:var(--text-strong);font-size:11px}.editor input:focus{border-color:var(--brand)}aside{position:sticky;top:68px}@media(max-width:860px){.work-layout{grid-template-columns:1fr}aside{position:static;grid-row:1}}@media(max-width:600px){.title-row{grid-template-columns:25px minmax(0,1fr)}.title-row>:global(.button){grid-column:2;justify-self:start}.title-row h1{font-size:21px}.issue-meta{margin-left:33px}.work-motion{grid-template-columns:36px minmax(0,1fr)}.motion-action{grid-column:2;justify-self:start}.brief>header,.activity>header{display:grid}}
</style>
