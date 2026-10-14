<script lang="ts">
  import ArrowLeft from '@lucide/svelte/icons/arrow-left';
  import GitCommitHorizontal from '@lucide/svelte/icons/git-commit-horizontal';
  import WorkItemStateIcon from '#lib/components/discussion/WorkItemStateIcon.svelte';
  import Notice from '#lib/components/feedback/Notice.svelte';
  import UserProfileLink from '#lib/components/identity/UserProfileLink.svelte';
  import MarkdownBody from '#lib/components/markdown/MarkdownBody.svelte';
  import Time from '#lib/components/page/Time.svelte';
  import type { PullPageState } from '#lib/pulls/detail/pull-page-state.svelte.js';
  import Button from '#lib/components/controls/Button.svelte';
  import MarkdownComposer from '#lib/components/markdown/MarkdownComposer.svelte';
  import { Discussion } from '../discussion/discussion.svelte';
  import RemovalDialog from '../discussion/RemovalDialog.svelte';
  import Revisions from '../discussion/Revisions.svelte';
  import { pullStateLabel } from './state-labels';

  let { pageState, viewerId }: { pageState: PullPageState; viewerId: string } = $props();
  const pull = $derived(pageState.pull);
  const discussion = $derived(new Discussion(pageState, viewerId));
  let uploading = $state(false);
  const source = $derived(
    pull.sourceRepository && pull.sourceRepository.owner !== pull.repository.owner
      ? `${pull.sourceRepository.owner}:${pull.sourceBranch}`
      : pull.sourceBranch
  );
</script>

<article class="mx-auto w-full max-w-184 px-4 pt-6 pb-28 sm:px-8">
  <header>
    <h1 class="text-2xl leading-tight font-semibold tracking-tight text-balance text-ink-strong sm:text-3xl">
      {pull.title}
    </h1>
    <p class="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-ink-muted">
      <span class="inline-flex items-center gap-1.5 font-medium text-ink"
        ><WorkItemStateIcon kind="pull" state={pull.state} size={15} />{pullStateLabel(pull.state)}</span
      >
      <UserProfileLink
        handle={pull.author}
        displayName={pull.authorDisplayName}
        avatarUrl={pull.authorAvatarUrl}
        kind={pull.authorKind}
        size={20}
      />
      <span class="inline-flex min-w-0 items-center gap-1.5 font-mono text-xs text-ink">
        <span class="truncate">{pull.targetBranch}</span><ArrowLeft size={12} class="shrink-0 text-ink-faint" /><span
          class="truncate">{source}</span
        >
      </span>
      <Time value={pull.createdAt} />
    </p>
  </header>

  {#if pageState.error}<Notice class="mt-6" ondismiss={() => (pageState.error = '')}>{pageState.error}</Notice>{/if}
  {#if pageState.revisionNotice}<Notice
      class="mt-6"
      tone="brand"
      icon={GitCommitHorizontal}
      ondismiss={() => (pageState.revisionNotice = false)}>A new revision arrived while you were reading.</Notice
    >{/if}

  <div class="mt-7 text-md">
    {#if pull.bodyHtml}<MarkdownBody html={pull.bodyHtml} />{:else}<p class="text-ink-faint">
        No description provided.
      </p>{/if}
  </div>

  <section class="mt-10" aria-label="Revisions">
    <Revisions {discussion} checksHref="/{pull.repository.owner}/{pull.repository.name}/pulls/{pull.number}/checks">
      {#snippet composer()}
        {#if pull.canManage && !pull.locked}<MarkdownComposer
            bind:value={pageState.commentBody}
            bind:uploading
            variant="inline"
            minHeight="64px"
            draftKey="pull:{pull.id}"
            context={discussion.context}
            disabled={pageState.busy}
            onsubmit={pageState.addComment}
          >
            {#snippet actions()}
              <Button
                size="small"
                variant="primary"
                loading={pageState.busy}
                disabled={!pageState.commentBody.trim() || uploading}
                onclick={pageState.addComment}>Comment</Button
              >
            {/snippet}
          </MarkdownComposer>{/if}
      {/snippet}
    </Revisions>
  </section>
  <RemovalDialog {discussion} />
</article>
