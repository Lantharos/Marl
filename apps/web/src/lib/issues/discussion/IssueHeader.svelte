<script lang="ts">
  import type { IssueDetail } from '@marl/contracts';
  import Bell from '@lucide/svelte/icons/bell';
  import BellOff from '@lucide/svelte/icons/bell-off';
  import Button from '#lib/components/controls/Button.svelte';
  import WorkItemReference from '#lib/components/discussion/WorkItemReference.svelte';
  import WorkItemStateIcon from '#lib/components/discussion/WorkItemStateIcon.svelte';
  import UserProfileLink from '#lib/components/identity/UserProfileLink.svelte';
  import ActionMenu from '#lib/components/overlays/ActionMenu.svelte';
  import Time from '#lib/components/page/Time.svelte';
  import { reporting } from '#lib/reporting/reporting.svelte.js';

  let {
    issue,
    signedIn,
    busy,
    onFollow,
    onChangeState
  }: {
    issue: IssueDetail;
    signedIn: boolean;
    busy: boolean;
    onFollow: () => void;
    onChangeState: () => void;
  } = $props();
  const open = $derived(issue.state === 'open');
</script>

<header class="mb-6 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
  <div class="min-w-0 flex-[1_1_480px]">
    <h1 class="text-2xl leading-tight font-semibold tracking-tight text-balance text-ink-strong sm:text-3xl">
      {issue.title}
      <WorkItemReference kind="issue" number={issue.number} class="font-normal text-ink-faint" />
    </h1>
    <p class="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1.5 text-sm text-ink-muted">
      <span
        class={[
          'inline-flex h-6.5 items-center gap-1.5 rounded-full px-2.5 text-xs font-semibold',
          open ? 'bg-success-soft text-success' : 'bg-surface-muted text-ink-muted'
        ]}><WorkItemStateIcon kind="issue" state={issue.state} size={14} />{open ? 'Open' : 'Closed'}</span
      >
      <UserProfileLink
        handle={issue.author}
        displayName={issue.authorDisplayName}
        kind={issue.authorKind}
        avatar={false}
        class="font-medium"
      />
      <span>opened <Time value={issue.createdAt} class="text-ink-muted" /></span>
      <span class="whitespace-nowrap tabular-nums"
        ><span aria-hidden="true">·</span>
        {issue.commentCount}
        {issue.commentCount === 1 ? 'comment' : 'comments'}</span
      >
    </p>
  </div>
  {#if signedIn}
    <div class="flex items-center gap-1.5">
      <Button
        size="small"
        variant="ghost"
        disabled={busy}
        aria-pressed={issue.participation.following}
        onclick={onFollow}
        >{#if issue.participation.following}<BellOff size={14} />Following{:else}<Bell size={14} />Follow{/if}</Button
      >
      {#if issue.canEdit}<Button size="small" disabled={busy} onclick={onChangeState}
          >{open ? 'Close issue' : 'Reopen issue'}</Button
        >{:else}<ActionMenu
          label="More issue options"
          actions={[
            { label: 'Report issue', onSelect: () => reporting.open({ type: 'issue', id: issue.id, label: 'issue' }) }
          ]}
        />{/if}
    </div>
  {/if}
</header>
