<script lang="ts">
  import Bell from '@lucide/svelte/icons/bell';
  import BellOff from '@lucide/svelte/icons/bell-off';
  import Button from '#lib/components/controls/Button.svelte';
  import WorkItemMetadata from '#lib/components/discussion/WorkItemMetadata.svelte';
  import WorkItemStateIcon from '#lib/components/discussion/WorkItemStateIcon.svelte';
  import IssueConclusion from '#lib/issues/discussion/IssueConclusion.svelte';
  import type { IssuePageState } from '#lib/issues/discussion/issue-page-state.svelte.js';
  import InspectorSection from './InspectorSection.svelte';
  import LinkedWork from './LinkedWork.svelte';

  let { pageState, viewerId }: { pageState: IssuePageState; viewerId: string } = $props();
  const issue = $derived(pageState.issue);
  const open = $derived(issue.state === 'open');
  const context = $derived({ owner: issue.repository.owner, repository: issue.repository.name });
</script>

<InspectorSection>
  <div class="flex items-center gap-2.5">
    <WorkItemStateIcon kind="issue" state={issue.state} size={18} />
    <strong class="text-md font-semibold text-ink-strong">{open ? 'Open' : 'Closed'}</strong>
  </div>
  <p class="mt-1 text-xs text-ink-muted">
    {issue.commentCount}
    {issue.commentCount === 1 ? 'comment' : 'comments'}
  </p>
  <div class="mt-4 flex flex-wrap gap-1.5">
    {#if issue.canEdit}<Button size="small" disabled={pageState.busy} onclick={pageState.changeState}
        >{open ? 'Close issue' : 'Reopen issue'}</Button
      >{/if}
    <Button
      size="small"
      variant="ghost"
      disabled={pageState.busy}
      aria-pressed={issue.participation.following}
      onclick={pageState.toggleFollowing}
      >{#if issue.participation.following}<BellOff size={14} />Unfollow{:else}<Bell size={14} />Follow{/if}</Button
    >
  </div>
</InspectorSection>

{#if issue.conclusion || issue.canConclude}
  <InspectorSection>
    <IssueConclusion
      conclusion={issue.conclusion}
      canEdit={issue.canConclude}
      busy={pageState.busy}
      {context}
      draftKey="issue:{issue.id}:{viewerId}"
      onSave={pageState.saveConclusion}
      onSource={async (id) => document.getElementById(`comment-${id}`)?.scrollIntoView({ block: 'start' })}
    />
  </InspectorSection>
{/if}

<LinkedWork items={issue.linkedItems} />

<InspectorSection>
  <WorkItemMetadata
    item={issue}
    busy={pageState.busy}
    onUpdate={pageState.updateMetadata}
    onCreateLabel={pageState.createLabel}
  />
</InspectorSection>
