<script lang="ts">
  import { page } from '$app/state';
  import { tick } from 'svelte';
  import ChevronDown from '@lucide/svelte/icons/chevron-down';
  import type { IssueComment, IssueDetail, IssueTimelineItem } from '@marl/contracts';
  import ArrowDown from '@lucide/svelte/icons/arrow-down';
  import Button from '#lib/components/controls/Button.svelte';
  import Notice from '#lib/components/feedback/Notice.svelte';
  import Field from '#lib/components/controls/Field.svelte';
  import WorkItemMetadata from '#lib/components/discussion/WorkItemMetadata.svelte';
  import MarkdownComposer from '#lib/components/markdown/MarkdownComposer.svelte';
  import Modal from '#lib/components/overlays/Modal.svelte';
  import Seo from '#lib/components/page/Seo.svelte';
  import { seoExcerpt } from '#lib/seo.js';
  import IssueActivity from './IssueActivity.svelte';
  import IssueConclusion from './IssueConclusion.svelte';
  import IssueDiscussionThread from './IssueDiscussionThread.svelte';
  import IssueHeader from './IssueHeader.svelte';
  import IssuePullLinks from './IssuePullLinks.svelte';
  import IssueReport from './IssueReport.svelte';
  import { isDiscussionEvent, issueDiscussion, observeIssueDiscussion } from './issue-discussion';
  import { IssuePageState } from './issue-page-state.svelte';

  let {
    data,
    params
  }: {
    data: { issue: IssueDetail; repository: { visibility: string }; shellUser: { id: string } | null };
    params: { owner: string; repo: string; number: string };
  } = $props();
  const owner = $derived(params.owner);
  const repo = $derived(params.repo);
  const context = $derived({ owner, repository: repo });
  const pageState = new IssuePageState(() => ({
    issue: data.issue,
    endpoint: `/repositories/${owner}/${repo}/issues/${params.number}`,
    signedIn: Boolean(data.shellUser)
  }));
  const issue = $derived(pageState.issue);
  const timeline = $derived(pageState.timeline);
  const discussion = $derived(issueDiscussion(timeline));
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
  const conversations = $derived(discussion.filter((item) => item.kind === 'thread').length);
  const hasUnread = $derived(resumeSequence > 0 && timeline.items.some((item) => item.sequence > resumeSequence));
  let comment = $state('');
  let uploading = $state(false);
  let editUploading = $state(false);
  let editing = $state(false);
  let editedTitle = $state('');
  let editedBody = $state('');
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

<IssueHeader
  {issue}
  signedIn={Boolean(data.shellUser)}
  busy={pageState.busy}
  onFollow={pageState.toggleFollowing}
  onChangeState={pageState.changeState}
/>

{#if pageState.error}
  <Notice class="mb-4" dismissLabel="Dismiss error" ondismiss={() => (pageState.error = '')}>{pageState.error}</Notice>
{/if}

<div
  class="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_280px] lg:gap-10 xl:grid-cols-[minmax(0,920px)_300px] xl:justify-between"
>
  <div class="min-w-0" {@attach (node) => observeIssueDiscussion(node, pageState.markRead)}>
    <IssueReport {issue} onEdit={openEditor} />

    <section class="mt-7" aria-labelledby="discussion-title">
      <header class="mb-2.5 flex min-h-8 items-center justify-between gap-3">
        <h2 id="discussion-title" class="text-base font-semibold text-ink-strong">
          Discussion{#if conversations}<span class="ml-1.5 font-medium text-ink-faint tabular-nums"
              >{conversations}</span
            >{/if}
        </h2>
        <div class="flex gap-1">
          {#if hasUnread}<Button size="small" variant="ghost" disabled={pageState.busy} onclick={resume}>Resume</Button
            >{/if}
          {#if discussion.length}<Button size="small" variant="ghost" onclick={latest}
              >Latest<ArrowDown size={14} /></Button
            >{/if}
        </div>
      </header>
      {#if timeline.hidden > 0}<Button
          class="mb-2.5"
          block
          variant="ghost"
          loading={pageState.busy}
          onclick={pageState.loadOlder}
          >Load earlier discussion <span class="font-normal text-ink-faint">{timeline.hidden} updates</span></Button
        >{/if}
      <div class="grid gap-2.5">
        {#each discussion as item (item.kind === 'thread' ? item.id : item.sequence)}
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
          {:else}<IssueActivity entries={item.entries} labels={issue.availableLabels} />{/if}
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
            placeholder={conversations ? 'Start a new conversation' : 'What do you think?'}
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
    </section>
  </div>

  <aside class="min-w-0 max-lg:order-first lg:sticky lg:top-20">
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
