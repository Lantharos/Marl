<script lang="ts">
  import type { IssueSummary } from '@marl/contracts';
  import MessageCircle from '@lucide/svelte/icons/message-circle';
  import LabelPill from '#lib/components/discussion/LabelPill.svelte';
  import WorkItemReference from '#lib/components/discussion/WorkItemReference.svelte';
  import WorkItemStateIcon from '#lib/components/discussion/WorkItemStateIcon.svelte';
  import UserAvatar from '#lib/components/identity/UserAvatar.svelte';
  import Tooltip from '#lib/components/overlays/Tooltip.svelte';
  import Time from '#lib/components/page/Time.svelte';

  let { issue, showRepository }: { issue: IssueSummary; showRepository: boolean } = $props();
  const repository = $derived(`${issue.repository.owner}/${issue.repository.name}`);
  const labels = $derived(issue.labels.slice(0, 3));
  const hiddenLabels = $derived(issue.labels.length - labels.length);
  const assignees = $derived(issue.assignees.slice(0, 3));
  const replies = $derived(`${issue.commentCount} ${issue.commentCount === 1 ? 'reply' : 'replies'}`);
</script>

<article
  class="relative grid scroll-mt-32 scroll-mb-4 grid-cols-[16px_minmax(0,1fr)] items-start gap-x-3 rounded-lg px-3 py-2.5 transition-colors [--row:var(--color-surface)] before:absolute before:inset-y-3 before:left-0 before:w-0.5 before:rounded-full before:bg-brand before:opacity-0 hover:bg-surface-hover hover:[--row:var(--color-surface-hover)] has-[a[data-issue-link]:focus-visible]:bg-surface-hover has-[a[data-issue-link]:focus-visible]:[--row:var(--color-surface-hover)] has-[a[data-issue-link]:focus-visible]:before:opacity-100 sm:min-h-11 sm:grid-cols-[16px_minmax(0,1fr)_auto] sm:items-center sm:py-1.5"
>
  <span class="mt-0.5 sm:mt-0"><WorkItemStateIcon kind="issue" state={issue.state} size={16} /></span>
  <div class="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 sm:flex-nowrap">
    <WorkItemReference
      kind="issue"
      number={issue.number}
      class="text-sm text-ink-faint max-sm:hidden sm:w-10 sm:shrink-0"
    />
    {#if showRepository}<a
        class="relative z-1 max-w-48 shrink-0 truncate text-sm text-ink-muted hover:text-brand max-sm:hidden"
        href="/{repository}">{repository}</a
      >{/if}
    <a
      data-issue-link
      class={[
        'min-w-0 text-base leading-snug font-medium outline-none after:absolute after:inset-0 after:rounded-lg max-sm:line-clamp-2 max-sm:basis-full sm:truncate',
        issue.state === 'closed' ? 'text-ink-muted' : 'text-ink-strong'
      ]}
      href="/{repository}/issues/{issue.number}">{issue.title}</a
    >
    {#if issue.unread}<span class="size-1.5 shrink-0 rounded-full bg-brand max-sm:hidden" role="img" aria-label="Unread"
      ></span>{/if}
    <span class="flex min-w-0 items-center gap-1.5 text-xs text-ink-muted sm:hidden">
      {#if issue.unread}<span class="size-1.5 shrink-0 rounded-full bg-brand" aria-hidden="true"></span>{/if}
      {#if showRepository}{repository}{/if}<WorkItemReference kind="issue" number={issue.number} />
      {#if issue.commentCount}<span class="flex items-center gap-1 tabular-nums" aria-label={replies}
          ><MessageCircle size={13} />{issue.commentCount}</span
        >{/if}
      <Time value={issue.updatedAt} class="text-ink-muted" />
    </span>
    {#each labels as label (label.id)}<span class="flex min-w-0 shrink-0 sm:max-w-36"
        ><LabelPill name={label.name} color={label.color} size="small" /></span
      >{/each}
    {#if hiddenLabels}<span class="shrink-0 text-xs text-ink-faint">+{hiddenLabels}</span>{/if}
  </div>
  <div
    class="grid items-center gap-x-3 text-xs text-ink-muted max-sm:hidden sm:grid-cols-[3.25rem_2.25rem_5.5rem] lg:grid-cols-[8rem_3.25rem_2.25rem_5.5rem]"
  >
    <span class="truncate max-lg:hidden">{issue.authorDisplayName}</span>
    <span class="flex justify-end">
      {#if assignees.length}<Tooltip
          text={`Assigned to ${issue.assignees.map((person) => person.displayName || person.handle).join(', ')}`}
          as="label"
        >
          {#snippet children(tooltip)}
            <span {...tooltip} class="relative z-1 flex -space-x-1.5">
              {#each assignees as person (person.id)}<span class="rounded-full ring-2 ring-(--row)"
                  ><UserAvatar name={person.displayName || person.handle} src={person.avatarUrl} size={20} /></span
                >{/each}
            </span>
          {/snippet}
        </Tooltip>{/if}
    </span>
    <span class="flex items-center justify-end gap-1 tabular-nums">
      {#if issue.commentCount}<MessageCircle size={13} aria-hidden="true" /><span aria-label={replies}
          >{issue.commentCount}</span
        >{/if}
    </span>
    <span class="text-right"><Time value={issue.updatedAt} class="text-ink-muted" /></span>
  </div>
</article>
