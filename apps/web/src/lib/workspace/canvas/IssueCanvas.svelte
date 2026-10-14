<script lang="ts">
  import { tick } from 'svelte';
  import Button from '#lib/components/controls/Button.svelte';
  import WorkItemStateIcon from '#lib/components/discussion/WorkItemStateIcon.svelte';
  import Notice from '#lib/components/feedback/Notice.svelte';
  import UserProfileLink from '#lib/components/identity/UserProfileLink.svelte';
  import MarkdownBody from '#lib/components/markdown/MarkdownBody.svelte';
  import MarkdownComposer from '#lib/components/markdown/MarkdownComposer.svelte';
  import Time from '#lib/components/page/Time.svelte';
  import IssueActivity from '#lib/issues/discussion/IssueActivity.svelte';
  import IssueDiscussionThread from '#lib/issues/discussion/IssueDiscussionThread.svelte';
  import { issueDiscussion, observeIssueDiscussion } from '#lib/issues/discussion/issue-discussion.js';
  import type { IssuePageState } from '#lib/issues/discussion/issue-page-state.svelte.js';
  import { issueStateLabel } from './state-labels';

  let { pageState, viewerId }: { pageState: IssuePageState; viewerId: string } = $props();
  const issue = $derived(pageState.issue);
  const timeline = $derived(pageState.timeline);
  const context = $derived({ owner: issue.repository.owner, repository: issue.repository.name });
  const discussion = $derived(issueDiscussion(timeline));
  const comments = $derived(
    new Map(
      [...timeline.context, ...timeline.items.flatMap((item) => (item.kind === 'comment' ? [item.value] : []))].map(
        (item) => [item.id, item]
      )
    )
  );
  const canReply = $derived(!issue.locked || issue.canManage);
  const draftKey = $derived(`issue:${issue.id}:${viewerId}`);
  let comment = $state('');
  let uploading = $state(false);

  async function send() {
    if (await pageState.addComment(comment)) comment = '';
  }

  async function showSource(id: string) {
    while (!document.getElementById(`comment-${id}`) && timeline.hidden > 0) {
      if (!(await pageState.loadOlder())) return;
      await tick();
    }
    document.getElementById(`comment-${id}`)?.scrollIntoView({ block: 'start', behavior: 'instant' });
  }
</script>

<article class="mx-auto w-full max-w-184 px-4 pt-6 pb-28 sm:px-8">
  <header>
    <h1 class="text-2xl leading-tight font-semibold tracking-tight text-balance text-ink-strong sm:text-3xl">
      {issue.title}
    </h1>
    <p class="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-ink-muted">
      <span class="inline-flex items-center gap-1.5 font-medium text-ink"
        ><WorkItemStateIcon kind="issue" state={issue.state} size={15} />{issueStateLabel(issue.state)}</span
      >
      <UserProfileLink
        handle={issue.author}
        displayName={issue.authorDisplayName}
        avatarUrl={issue.authorAvatarUrl}
        kind={issue.authorKind}
        size={20}
      />
      <Time value={issue.createdAt} />
    </p>
  </header>

  {#if pageState.error}<Notice class="mt-6" ondismiss={() => (pageState.error = '')}>{pageState.error}</Notice>{/if}

  <div class="mt-7 text-md">
    {#if issue.bodyHtml}<MarkdownBody html={issue.bodyHtml} />{:else}<p class="text-ink-faint">
        No description provided.
      </p>{/if}
  </div>

  <section
    class="mt-10 grid gap-2.5"
    aria-label="Discussion"
    {@attach (node) => observeIssueDiscussion(node, pageState.markRead)}
  >
    {#if timeline.hidden > 0}<Button variant="ghost" block loading={pageState.busy} onclick={pageState.loadOlder}
        >Load earlier discussion <span class="font-normal text-ink-faint">{timeline.hidden} updates</span></Button
      >{/if}
    {#each discussion as item (item.kind === 'thread' ? item.id : item.sequence)}
      {#if item.kind === 'thread'}<IssueDiscussionThread
          thread={item}
          {viewerId}
          {context}
          {canReply}
          canConclude={false}
          busy={pageState.busy}
          {comments}
          {draftKey}
          onSave={pageState.saveComment}
          onDelete={pageState.deleteComment}
          onReply={pageState.addComment}
          onSource={showSource}
          onConclude={() => {}}
        />{:else}<IssueActivity entries={item.entries} labels={issue.availableLabels} />{/if}
    {/each}
  </section>

  {#if canReply}
    <section class="mt-6" aria-label="Reply">
      <MarkdownComposer
        bind:value={comment}
        bind:uploading
        {context}
        disabled={pageState.busy}
        draftKey="{draftKey}:comment"
        placeholder={discussion.length ? 'Reply' : 'Start the discussion'}
        minHeight={96}
        onsubmit={send}
      />
      <footer class="mt-2.5 flex justify-end">
        <Button variant="primary" loading={pageState.busy} disabled={uploading || !comment.trim()} onclick={send}
          >Comment</Button
        >
      </footer>
    </section>
  {:else}<p class="mt-6 text-sm text-ink-muted">This discussion is locked.</p>{/if}
</article>
