<script lang="ts">
  import { page } from '$app/state';
  import type { PullRequestEvent, WorkItemLabel } from '@marl/contracts';
  import type { Component } from 'svelte';
  import GitCommitHorizontal from '@lucide/svelte/icons/git-commit-horizontal';
  import GitCompareArrows from '@lucide/svelte/icons/git-compare-arrows';
  import GitMerge from '@lucide/svelte/icons/git-merge';
  import GitPullRequest from '@lucide/svelte/icons/git-pull-request';
  import GitPullRequestClosed from '@lucide/svelte/icons/git-pull-request-closed';
  import Link2 from '@lucide/svelte/icons/link-2';
  import ListOrdered from '@lucide/svelte/icons/list-ordered';
  import Lock from '@lucide/svelte/icons/lock';
  import LockOpen from '@lucide/svelte/icons/lock-open';
  import Pencil from '@lucide/svelte/icons/pencil';
  import Tag from '@lucide/svelte/icons/tag';
  import UserRound from '@lucide/svelte/icons/user-round';
  import LabelPill from '#lib/components/discussion/LabelPill.svelte';
  import WorkItemReference from '#lib/components/discussion/WorkItemReference.svelte';
  import UserProfileLink from '#lib/components/identity/UserProfileLink.svelte';
  import Tooltip from '#lib/components/overlays/Tooltip.svelte';
  import Time from '#lib/components/page/Time.svelte';
  import { eventPhrase, isMilestone, noteRows, type NoteRow } from './pull-notes';
  import type { NoteItem } from './revision-activity';

  let {
    notes,
    labels,
    repository
  }: { notes: NoteItem[]; labels: WorkItemLabel[]; repository: { owner: string; name: string } } = $props();

  const visibleLimit = 3;
  const rows = $derived(noteRows(notes));
  let expanded = $state(false);
  const visible = $derived(
    expanded || rows.length <= visibleLimit + 1
      ? rows
      : rows.filter((row, index) => index < visibleLimit || isMilestone(row))
  );

  const icons: Partial<Record<PullRequestEvent['kind'], Component>> = {
    title_changed: Pencil,
    description_changed: Pencil,
    locked: Lock,
    unlocked: LockOpen,
    ready: GitPullRequest,
    closed: GitPullRequestClosed,
    reopened: GitPullRequest,
    merged: GitMerge,
    head_updated: GitCommitHorizontal,
    queued: ListOrdered,
    dequeued: ListOrdered,
    force_pushed: GitCompareArrows
  };
  const tones: Partial<Record<PullRequestEvent['kind'], string>> = {
    closed: 'text-danger',
    reopened: 'text-success',
    merged: 'text-merged',
    force_pushed: 'text-warning',
    dequeued: 'text-warning'
  };

  function rowIcon(row: NoteRow) {
    if (row.kind === 'reference') return Link2;
    if (row.kind === 'labels') return Tag;
    if (row.kind === 'assignees') return UserRound;
    return icons[row.event.kind] ?? GitCommitHorizontal;
  }

  function pushedCommits(event: PullRequestEvent): Array<{ id: string; title: string }> {
    return event.kind === 'head_updated' ? JSON.parse(event.details.commits ?? '[]') : [];
  }

  const labelColor = (name: string) => labels.find((label) => label.name === name)?.color ?? 'var(--color-ink-faint)';
</script>

{#snippet actor(event: PullRequestEvent)}
  <UserProfileLink
    handle={event.actor}
    displayName={event.actorDisplayName}
    avatar={false}
    class="text-sm font-medium text-ink"
  />
{/snippet}

{#snippet changes(row: Extract<NoteRow, { change: unknown }>)}
  {#each [['added', row.change.added], ['removed', row.change.removed]] as const as [verb, values] (verb)}
    {#if values.length}
      <span class="inline-flex flex-wrap items-center gap-1">
        {verb}
        {#each values as value (value)}
          {#if row.kind === 'labels'}<LabelPill name={value} color={labelColor(value)} size="small" />{:else}<a
              class="font-medium text-ink hover:text-brand"
              href="/{value}">{value}</a
            >{/if}
        {/each}
      </span>
    {/if}
  {/each}
{/snippet}

<ol class="grid gap-px py-1" aria-label="Updates">
  {#each visible as row (row.key)}
    {@const Icon = rowIcon(row)}
    {@const milestone = isMilestone(row)}
    <li
      class={[
        'grid grid-cols-[16px_minmax(0,1fr)_auto] items-start gap-2.5 px-3 py-1.5 text-sm leading-6',
        milestone ? 'text-ink' : 'text-ink-muted'
      ]}
    >
      <Icon
        size={15}
        class={['mt-1', row.kind === 'event' ? (tones[row.event.kind] ?? 'text-ink-faint') : 'text-ink-faint']}
        aria-hidden="true"
      />
      <p class="flex min-w-0 flex-wrap items-center gap-x-1.5">
        {#if row.kind === 'reference'}
          {@const source = row.reference.source}
          {#if source}Mentioned in
            <a
              class="group min-w-0 truncate text-ink hover:text-brand"
              href="/{source.repository.owner}/{source.repository.name}/{source.kind === 'issue'
                ? 'issues'
                : 'pulls'}/{source.number}"
              ><WorkItemReference
                kind={source.kind}
                number={source.number}
                repository={source.repository.owner === page.params.owner && source.repository.name === page.params.repo
                  ? undefined
                  : `${source.repository.owner}/${source.repository.name}`}
                class="font-semibold text-ink-strong group-hover:text-brand"
              />
              {source.title}</a
            >{:else}Mentioned in private work{/if}
        {:else}
          {@render actor(row.event)}
          {#if row.kind === 'event'}
            <span class="min-w-0 break-words">{eventPhrase(row.event)}</span>
            {#each pushedCommits(row.event).slice(0, 3) as commit (commit.id)}<Tooltip text={commit.title}>
                {#snippet children(tooltip)}
                  <a
                    {...tooltip}
                    class="font-mono text-xs text-ink-muted hover:text-brand"
                    href="/{repository.owner}/{repository.name}/commit/{encodeURIComponent(commit.id)}"
                    >{commit.id.slice(0, 7)}</a
                  >
                {/snippet}
              </Tooltip>{/each}
          {:else}{@render changes(row)}{/if}
        {/if}
      </p>
      <Time
        value={row.kind === 'reference' ? row.reference.createdAt : row.event.createdAt}
        class="text-xs leading-6 whitespace-nowrap text-ink-faint"
      />
    </li>
  {/each}
  {#if visible.length < rows.length}
    <li class="px-3 py-0.5">
      <button
        type="button"
        class="ml-6.5 text-xs font-semibold text-ink-muted hover:text-brand"
        onclick={() => (expanded = true)}
        >{rows.length - visible.length} more {rows.length - visible.length === 1 ? 'update' : 'updates'}</button
      >
    </li>
  {/if}
</ol>
