<script lang="ts">
  import { page } from '$app/state';
  import { tick } from 'svelte';
  import type { IssueComment, IssueDetail, IssueTimelineItem } from '@marl/contracts';
  import ArrowDown from '@lucide/svelte/icons/arrow-down';
  import Flag from '@lucide/svelte/icons/flag';
  import Bell from '@lucide/svelte/icons/bell';
  import BellOff from '@lucide/svelte/icons/bell-off';
  import ChevronDown from '@lucide/svelte/icons/chevron-down';
  import Pencil from '@lucide/svelte/icons/pencil';
  import X from '@lucide/svelte/icons/x';
  import Button from '$lib/components/controls/Button.svelte';
  import Field from '$lib/components/controls/Field.svelte';
  import ReferenceTimelineEvent from '$lib/components/discussion/ReferenceTimelineEvent.svelte';
  import WorkItemMetadata from '$lib/components/discussion/WorkItemMetadata.svelte';
  import WorkItemStateIcon from '$lib/components/discussion/WorkItemStateIcon.svelte';
  import UserProfileLink from '$lib/components/identity/UserProfileLink.svelte';
  import MarkdownBody from '$lib/components/markdown/MarkdownBody.svelte';
  import MarkdownComposer from '$lib/components/markdown/MarkdownComposer.svelte';
  import Modal from '$lib/components/overlays/Modal.svelte';
  import Seo from '$lib/components/page/Seo.svelte';
  import Time from '$lib/components/page/Time.svelte';
  import { reporting } from '$lib/moderation/reporting.svelte';
  import { seoExcerpt } from '$lib/seo';
  import IssueConclusion from './IssueConclusion.svelte';
  import IssueDiscussionThread from './IssueDiscussionThread.svelte';
  import IssueEventRow from './IssueEventRow.svelte';
  import IssuePullLinks from './IssuePullLinks.svelte';
  import { isDiscussionEvent, issueDiscussion, observeIssueDiscussion } from './issue-discussion';
  import { IssuePageState } from './issue-page-state.svelte';

  let { data }: { data: { issue: IssueDetail; repository: { visibility: string }; shellUser: { id: string } | null } } =
    $props();
  const owner = $derived(page.params.owner ?? '');
  const repo = $derived(page.params.repo ?? '');
  const context = $derived({ owner, repository: repo });
  const pageState = new IssuePageState(() => ({
    issue: data.issue,
    endpoint: `/repositories/${owner}/${repo}/issues/${page.params.number}`,
    signedIn: Boolean(data.shellUser)
  }));
  const issue = $derived(pageState.issue);
  const timeline = $derived(pageState.timeline);
  const threads = $derived(issueDiscussion(timeline));
  const history = $derived(timeline.items.filter((item) => item.kind === 'event' && !isDiscussionEvent(item.value)));
  const comments = $derived(
    new Map(
      [...timeline.context, ...timeline.items.flatMap((item) => (item.kind === 'comment' ? [item.value] : []))].map(
        (item) => [item.id, item]
      )
    )
  );
  const canReply = $derived(Boolean(data.shellUser) && (!issue.locked || issue.canManage));
  const draftKey = $derived(data.shellUser ? `issue:${issue.id}:${data.shellUser.id}` : undefined);
  const resumeSequence = $derived(data.issue.participation.lastReadSequence);
  const hasUnread = $derived(resumeSequence > 0 && timeline.items.some((item) => item.sequence > resumeSequence));
  let comment = $state('');
  let uploading = $state(false);
  let editUploading = $state(false);
  let editing = $state(false);
  let editedTitle = $state('');
  let editedBody = $state('');
  let reportExpanded = $state(false);
  let reportOverflow = $state(false);
  let historyOpen = $state(false);
  let detailsOpen = $state(false);
  let conclusionEditor = $state<IssueConclusion>();

  function openEditor() {
    editedTitle = issue.title;
    editedBody = issue.body;
    editing = true;
  }

  async function saveDetails() {
    if (editedTitle.trim().length < 3 || editUploading) return;
    if (await pageState.saveDetails(editedTitle, editedBody)) {
      editedBody = '';
      await tick();
      editing = false;
    }
  }

  function scrollToComment(id: string) {
    const element = document.getElementById(`comment-${id}`);
    element?.scrollIntoView({ block: 'start', behavior: 'instant' });
    element?.focus({ preventScroll: true });
    return Boolean(element);
  }

  async function showSource(id: string) {
    while (!document.getElementById(`comment-${id}`) && timeline.hidden > 0) {
      if (!(await pageState.loadOlder())) return;
      await tick();
    }
    if (!scrollToComment(id)) pageState.error = 'This comment is no longer available.';
  }

  function scrollToItem(item: IssueTimelineItem) {
    if (item.kind === 'comment') scrollToComment(item.value.id);
    else document.getElementById(`activity-${item.sequence}`)?.scrollIntoView({ block: 'center', behavior: 'instant' });
  }

  async function resume() {
    while (timeline.hidden > 0 && resumeSequence < (timeline.loadBeforeSequence ?? 0) - 1) {
      if (!(await pageState.loadOlder())) return;
    }
    await tick();
    const next = timeline.items.find(
      (item) => item.sequence > resumeSequence && (item.kind !== 'event' || isDiscussionEvent(item.value))
    );
    if (next) scrollToItem(next);
  }

  function latest() {
    const item = timeline.items.findLast((item) => item.kind !== 'event' || isDiscussionEvent(item.value));
    if (item) scrollToItem(item);
    else document.getElementById('issue-composer')?.scrollIntoView({ block: 'center', behavior: 'instant' });
  }

  function measureReport(node: HTMLElement) {
    const measure = () => {
      if (!reportExpanded) reportOverflow = node.scrollHeight > node.clientHeight + 1;
    };
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    const markdown = node.querySelector('.markdown');
    if (markdown) observer.observe(markdown);
    return () => observer.disconnect();
  }

  function promoteConclusion(selected: IssueComment) {
    detailsOpen = true;
    conclusionEditor?.promote(selected);
  }
</script>

<Seo
  title={`${issue.title} · #${issue.number} · ${owner}/${repo} · Marl`}
  description={seoExcerpt(issue.body, `${issue.title} — issue #${issue.number} in ${owner}/${repo}.`)}
  path={page.url.pathname}
  robots={data.repository.visibility === 'public' ? 'index, follow' : 'noindex, nofollow'}
/>

<header class="mb-6">
  <h1 class="text-2xl leading-tight font-semibold tracking-tight text-balance text-ink-strong sm:text-[28px]">
    {issue.title} <span class="font-normal text-ink-faint">#{issue.number}</span>
  </h1>
  <div class="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-ink-muted">
    <span
      class={[
        'inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-xs font-semibold',
        issue.state === 'open' ? 'bg-success-soft text-success' : 'bg-surface-muted text-ink-muted'
      ]}
      ><WorkItemStateIcon kind="issue" state={issue.state} size={14} />{issue.state === 'open'
        ? 'Open'
        : 'Closed'}</span
    >
    <span>{issue.commentCount} {issue.commentCount === 1 ? 'comment' : 'comments'}</span>
    {#if data.shellUser}<Button
        size="small"
        variant="ghost"
        disabled={pageState.busy}
        aria-pressed={issue.participation.following}
        onclick={pageState.toggleFollowing}
        >{#if issue.participation.following}<BellOff size={14} />Following{:else}<Bell size={14} />Follow{/if}</Button
      >{/if}
    {#if data.shellUser && !issue.canEdit}<Button
        size="small"
        variant="ghost"
        onclick={() => reporting.open({ type: 'issue', id: issue.id, label: 'issue' })}><Flag size={14} />Report</Button
      >{/if}
  </div>
</header>

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

<div class="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_300px] lg:gap-10">
  <main class="min-w-0" {@attach (node) => observeIssueDiscussion(node, pageState.markRead)}>
    <article class="surface p-4 sm:p-5">
      <header class="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <UserProfileLink
          handle={issue.author}
          displayName={issue.authorDisplayName}
          avatarUrl={issue.authorAvatarUrl}
          kind={issue.authorKind}
          size={30}
          class="mr-auto"
        />
        <Time value={issue.createdAt} />
        {#if issue.canEdit}<Button size="small" variant="ghost" onclick={openEditor}><Pencil size={14} />Edit</Button
          >{/if}
      </header>
      <div
        class={[
          'mt-3.5',
          !reportExpanded && 'max-h-150 overflow-hidden',
          !reportExpanded && reportOverflow && 'mask-b-from-80%'
        ]}
        {@attach measureReport}
      >
        {#if issue.bodyHtml}<MarkdownBody html={issue.bodyHtml} />{:else}<p class="text-sm text-ink-faint italic">
            No description provided.
          </p>{/if}
      </div>
      {#if reportOverflow}<Button
          class="mt-2 -ml-2"
          size="small"
          variant="ghost"
          aria-expanded={reportExpanded}
          onclick={() => (reportExpanded = !reportExpanded)}
          >{reportExpanded ? 'Show less' : 'Read full description'}<ChevronDown size={14} /></Button
        >{/if}
    </article>

    <section class="mt-8" aria-labelledby="discussion-title">
      <header class="mb-3 flex min-h-9 items-center justify-between gap-3">
        <h2 id="discussion-title" class="text-base font-semibold text-ink-strong">Discussion</h2>
        <div class="flex gap-1">
          {#if hasUnread}<Button size="small" variant="ghost" disabled={pageState.busy} onclick={resume}>Resume</Button
            >{/if}
          {#if threads.length}<Button size="small" variant="ghost" onclick={latest}
              >Latest<ArrowDown size={14} /></Button
            >{/if}
        </div>
      </header>
      {#if timeline.hidden > 0}<Button
          class="mb-3"
          block
          variant="ghost"
          loading={pageState.busy}
          onclick={pageState.loadOlder}
          >Load earlier discussion <span class="font-normal text-ink-faint">{timeline.hidden} updates</span></Button
        >{/if}
      <div class="grid gap-3">
        {#each threads as item (item.kind === 'thread' ? item.id : item.sequence)}
          {#if item.kind === 'thread'}<IssueDiscussionThread
              thread={item}
              viewerId={data.shellUser?.id}
              {context}
              {canReply}
              canConclude={issue.canConclude}
              busy={pageState.busy}
              {comments}
              {draftKey}
              onSave={pageState.saveComment}
              onDelete={pageState.deleteComment}
              onReply={pageState.addComment}
              onSource={showSource}
              onConclude={promoteConclusion}
            />
          {:else if item.kind === 'reference'}<div id={`activity-${item.sequence}`}>
              <ReferenceTimelineEvent reference={item.value} /><span
                class="block h-px"
                data-read-sequence={item.sequence}
                aria-hidden="true"
              ></span>
            </div>
          {:else}<IssueEventRow
              id={`activity-${item.sequence}`}
              event={item.value}
              sequence={item.sequence}
              createdAt={item.createdAt}
            />{/if}
        {/each}
      </div>
      {#if canReply}
        <section id="issue-composer" class="mt-5">
          <MarkdownComposer
            bind:value={comment}
            bind:uploading
            {context}
            disabled={pageState.busy || !canReply}
            draftKey={draftKey ? `${draftKey}:comment` : undefined}
            placeholder={threads.length ? 'Add to the discussion' : 'What do you think?'}
            minHeight={120}
            onsubmit={async () => {
              if (await pageState.addComment(comment)) comment = '';
            }}
          />
          <footer class="mt-2.5 flex justify-end">
            <Button
              variant="primary"
              loading={pageState.busy}
              disabled={uploading || !comment.trim()}
              onclick={async () => {
                if (await pageState.addComment(comment)) comment = '';
              }}>Comment</Button
            >
          </footer>
        </section>
      {:else if issue.locked}<p class="mt-5 text-sm text-ink-muted">This discussion is locked.</p>
      {:else}<p class="mt-5 text-sm text-ink-muted">
          <a class="font-semibold text-brand hover:underline" href="/sign-in">Sign in</a> to join the discussion.
        </p>{/if}
      {#if history.length}
        <section class="mt-8 border-t border-line-subtle pt-3">
          <Button
            size="small"
            variant="ghost"
            class="-ml-2"
            aria-expanded={historyOpen}
            onclick={() => (historyOpen = !historyOpen)}
            >History <span class="text-ink-faint">{history.length}</span><ChevronDown size={14} /></Button
          >
          {#if historyOpen}<div class="mt-1">
              {#each history as item (item.sequence)}{#if item.kind === 'event'}<IssueEventRow
                    event={item.value}
                    sequence={item.sequence}
                    createdAt={item.createdAt}
                  />{/if}{/each}
            </div>{/if}
        </section>
      {/if}
    </section>
  </main>

  <aside class="min-w-0 lg:sticky lg:top-20">
    <Button
      class="w-full justify-between lg:hidden"
      aria-expanded={detailsOpen}
      aria-controls="issue-details"
      onclick={() => (detailsOpen = !detailsOpen)}>Issue details<ChevronDown size={15} /></Button
    >
    <div id="issue-details" class={['mt-4 gap-6 lg:mt-0 lg:grid', detailsOpen ? 'grid' : 'hidden']}>
      <IssueConclusion
        bind:this={conclusionEditor}
        conclusion={issue.conclusion}
        canEdit={issue.canConclude}
        busy={pageState.busy}
        {context}
        {draftKey}
        onSave={pageState.saveConclusion}
        onSource={showSource}
      />
      <IssuePullLinks
        items={issue.linkedItems}
        {context}
        canLink={issue.canEdit || issue.canManage}
        onLink={pageState.linkPull}
      />
      <WorkItemMetadata
        item={issue}
        busy={pageState.busy}
        onUpdate={pageState.updateMetadata}
        onCreateLabel={pageState.createLabel}
      />
      {#if issue.canEdit}<Button
          size="small"
          class="justify-self-start"
          disabled={pageState.busy}
          onclick={pageState.changeState}>{issue.state === 'open' ? 'Close issue' : 'Reopen issue'}</Button
        >{/if}
    </div>
  </aside>
</div>

<Modal open={editing} title="Edit issue" size="large" onClose={() => !editUploading && (editing = false)}>
  <div class="grid gap-5">
    <Field label="Title"
      ><input class="field" bind:value={editedTitle} maxlength="240" disabled={pageState.busy} /></Field
    >
    <div class="grid gap-2">
      <span class="text-sm font-semibold text-ink-strong">Description</span>
      <MarkdownComposer
        bind:value={editedBody}
        bind:uploading={editUploading}
        {context}
        disabled={pageState.busy}
        draftKey={draftKey ? `${draftKey}:description` : undefined}
        minHeight={200}
        onsubmit={saveDetails}
      />
    </div>
  </div>
  {#snippet actions()}
    <Button size="small" disabled={editUploading} onclick={() => (editing = false)}>Cancel</Button>
    <Button
      size="small"
      variant="primary"
      loading={pageState.busy}
      disabled={editUploading || editedTitle.trim().length < 3}
      onclick={saveDetails}>Save changes</Button
    >
  {/snippet}
</Modal>
