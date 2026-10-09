<script lang="ts">
  import { page } from '$app/state';
  import type { IssueEvent, WorkItemLabel } from '@marl/contracts';
  import type { LucideIcon } from '@lucide/svelte';
  import CircleCheck from '@lucide/svelte/icons/circle-check';
  import CircleDot from '@lucide/svelte/icons/circle-dot';
  import GitMerge from '@lucide/svelte/icons/git-merge';
  import Lock from '@lucide/svelte/icons/lock';
  import LockOpen from '@lucide/svelte/icons/lock-open';
  import PencilLine from '@lucide/svelte/icons/pencil-line';
  import Tag from '@lucide/svelte/icons/tag';
  import UserRoundMinus from '@lucide/svelte/icons/user-round-minus';
  import UserRoundPlus from '@lucide/svelte/icons/user-round-plus';
  import LabelPill from '#lib/components/discussion/LabelPill.svelte';
  import WorkItemReference from '#lib/components/discussion/WorkItemReference.svelte';
  import WorkItemStateIcon from '#lib/components/discussion/WorkItemStateIcon.svelte';
  import UserProfileLink from '#lib/components/identity/UserProfileLink.svelte';
  import Time from '#lib/components/page/Time.svelte';
  import { issueEventCopy, type ActivityEntry } from './issue-discussion';

  let { entry, labels }: { entry: ActivityEntry; labels: WorkItemLabel[] } = $props();

  const icons: Record<IssueEvent['kind'], LucideIcon> = {
    title_changed: PencilLine,
    description_changed: PencilLine,
    assigned: UserRoundPlus,
    unassigned: UserRoundMinus,
    label_added: Tag,
    label_removed: Tag,
    locked: Lock,
    unlocked: LockOpen,
    closed: CircleCheck,
    reopened: CircleDot,
    closed_by_pull: GitMerge
  };
  const tones: Partial<Record<IssueEvent['kind'], string>> = {
    closed: 'text-ink-muted',
    reopened: 'text-success',
    closed_by_pull: 'text-merged'
  };
  const source = $derived(entry.kind === 'reference' ? entry.value.source : undefined);
  const local = $derived(
    source?.repository.owner === page.params.owner && source?.repository.name === page.params.repo
  );
  const label = $derived(
    entry.kind === 'event' && (entry.value.kind === 'label_added' || entry.value.kind === 'label_removed')
      ? labels.find((item) => item.name === entry.value.details.label)
      : undefined
  );
  const Icon = $derived(entry.kind === 'event' ? icons[entry.value.kind] : Lock);
  const tone = $derived((entry.kind === 'event' && tones[entry.value.kind]) || 'text-ink-faint');
</script>

<div
  id={`activity-${entry.sequence}`}
  class="grid scroll-my-25 grid-cols-[16px_minmax(0,1fr)_auto] items-baseline gap-x-2.5 rounded-md px-2.5 py-1.5 text-sm text-ink-muted"
>
  <span class="grid translate-y-0.5 place-items-center self-start">
    {#if source}<WorkItemStateIcon kind={source.kind} state={source.state} size={14} />{:else}<Icon
        size={14}
        class={tone}
      />{/if}
  </span>
  <p class="min-w-0 leading-relaxed">
    {#if entry.kind === 'reference'}
      {#if source}Mentioned in <a
          class="group text-ink hover:text-brand"
          href="/{source.repository.owner}/{source.repository.name}/{source.kind === 'issue'
            ? 'issues'
            : 'pulls'}/{source.number}"
          ><WorkItemReference
            kind={source.kind}
            number={source.number}
            repository={local ? undefined : `${source.repository.owner}/${source.repository.name}`}
            class="font-semibold text-ink-strong group-hover:text-brand"
          />
          {source.title}</a
        >{:else}Mentioned in private work{/if}
    {:else}
      <UserProfileLink
        handle={entry.value.actor}
        displayName={entry.value.actorDisplayName}
        avatar={false}
        class="align-baseline"
      />
      {#if label}{entry.value.kind === 'label_added' ? 'added' : 'removed'}
        <span class="inline-flex align-middle"><LabelPill name={label.name} color={label.color} size="small" /></span
        >{:else}{issueEventCopy(entry.value)}{/if}
      {#if entry.value.kind === 'closed_by_pull'}<a
          class="font-medium text-ink hover:text-brand"
          href="/{entry.value.details.owner}/{entry.value.details.repository}/pulls/{entry.value.details.number}"
          ><WorkItemReference
            kind="pull"
            number={entry.value.details.number}
            repository="{entry.value.details.owner}/{entry.value.details.repository}"
          /></a
        >{/if}
    {/if}
  </p>
  <Time value={entry.createdAt} class="text-xs whitespace-nowrap text-ink-faint" />
  <span class="col-span-full block h-px" data-read-sequence={entry.sequence} aria-hidden="true"></span>
</div>
