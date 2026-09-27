<script lang="ts">
  import type { WorkItemLabel, WorkItemPerson } from '@marl/contracts';
  import Lock from '@lucide/svelte/icons/lock';
  import Pencil from '@lucide/svelte/icons/pencil';
  import Unlock from '@lucide/svelte/icons/lock-open';
  import { dismissable } from '$lib/actions/dismissable';
  import Button from '../controls/Button.svelte';
  import UserProfileLink from '../identity/UserProfileLink.svelte';
  import MetadataPicker from '../overlays/MetadataPicker.svelte';
  import LabelPill from './LabelPill.svelte';

  type MetadataUpdate = { assigneeIds?: string[]; labelIds?: string[]; locked?: boolean };
  let {
    item,
    busy,
    onUpdate,
    onCreateLabel
  }: {
    item: {
      canManage: boolean;
      locked: boolean;
      assignees: WorkItemPerson[];
      availableAssignees: WorkItemPerson[];
      labels: WorkItemLabel[];
      availableLabels: WorkItemLabel[];
    };
    busy: boolean;
    onUpdate: (update: MetadataUpdate) => Promise<void>;
    onCreateLabel: (name: string) => Promise<void>;
  } = $props();

  let open = $state<'assignees' | 'labels' | null>(null);
  let anchor = $state<HTMLElement>();
  let query = $state('');
  let creating = $state(false);

  const search = $derived(query.trim().toLowerCase());
  const labelName = $derived(query.trim().replace(/\s+/g, ' '));
  const canCreate = $derived(
    Boolean(labelName) && !item.availableLabels.some((label) => label.name.toLowerCase() === labelName.toLowerCase())
  );
  const assigneeOptions = $derived(
    item.availableAssignees
      .filter((person) => `${person.displayName} ${person.handle}`.toLowerCase().includes(search))
      .map((person) => ({
        id: person.id,
        title: person.displayName || person.handle,
        detail: `@${person.handle}`,
        avatar: { name: person.displayName || person.handle, src: person.avatarUrl },
        selected: item.assignees.some((assignee) => assignee.id === person.id)
      }))
  );
  const labelOptions = $derived(
    item.availableLabels
      .filter((label) => `${label.name} ${label.description}`.toLowerCase().includes(search))
      .map((label) => ({
        id: label.id,
        title: label.name,
        detail: label.description || undefined,
        color: label.color,
        selected: item.labels.some((selected) => selected.id === label.id)
      }))
  );

  function openPicker(picker: 'assignees' | 'labels', event: MouseEvent) {
    anchor = event.currentTarget as HTMLElement;
    query = '';
    open = open === picker ? null : picker;
  }

  function closeOnEscape(event: KeyboardEvent) {
    if (event.key !== 'Escape' || !open) return;
    event.stopPropagation();
    open = null;
    anchor?.focus();
  }

  function toggled(ids: string[], id: string) {
    return ids.includes(id) ? ids.filter((value) => value !== id) : [...ids, id];
  }

  async function createLabel() {
    if (!canCreate || creating) return;
    creating = true;
    try {
      await onCreateLabel(labelName);
      query = '';
    } finally {
      creating = false;
    }
  }
</script>

<svelte:window onkeydown={closeOnEscape} />

{#snippet heading(title: string, picker: 'assignees' | 'labels')}
  <div class="flex h-7 items-center justify-between">
    <h3 class="text-xs font-semibold text-ink-muted">{title}</h3>
    {#if item.canManage}<Button
        icon
        size="small"
        variant="ghost"
        aria-label={`Edit ${title.toLowerCase()}`}
        aria-expanded={open === picker}
        onclick={(event) => openPicker(picker, event)}><Pencil size={13} /></Button
      >{/if}
  </div>
{/snippet}

<section class="grid gap-6">
  <div use:dismissable={() => open === 'assignees' && (open = null)}>
    {@render heading('Assignees', 'assignees')}
    <div class="mt-2 grid gap-2">
      {#each item.assignees as person (person.id)}<UserProfileLink
          handle={person.handle}
          displayName={person.displayName || person.handle}
          avatarUrl={person.avatarUrl}
          size={24}
        />{:else}<span class="text-sm text-ink-faint">No one assigned</span>{/each}
    </div>
    {#if open === 'assignees'}
      <MetadataPicker
        {anchor}
        bind:query
        placeholder="Find a person"
        options={assigneeOptions}
        {busy}
        empty="No matching people"
        onToggle={(id) =>
          onUpdate({
            assigneeIds: toggled(
              item.assignees.map((person) => person.id),
              id
            )
          })}
      />
    {/if}
  </div>

  <div use:dismissable={() => open === 'labels' && (open = null)}>
    {@render heading('Labels', 'labels')}
    <div class="mt-2 flex flex-wrap gap-1.5">
      {#each item.labels as label (label.id)}<LabelPill name={label.name} color={label.color} />{:else}<span
          class="text-sm text-ink-faint">No labels</span
        >{/each}
    </div>
    {#if open === 'labels'}
      <MetadataPicker
        {anchor}
        bind:query
        placeholder="Find or create a label"
        options={labelOptions}
        busy={busy || creating}
        empty="No matching labels"
        create={canCreate ? { label: labelName, busy: creating, onCreate: createLabel } : undefined}
        onToggle={(id) =>
          onUpdate({
            labelIds: toggled(
              item.labels.map((label) => label.id),
              id
            )
          })}
      />
    {/if}
  </div>

  <div class="flex min-h-9 items-center justify-between gap-3 text-sm text-ink-muted">
    <span class="flex items-center gap-1.5"
      >{#if item.locked}<Lock size={14} />Conversation locked{:else}<Unlock size={14} />Conversation open{/if}</span
    >
    {#if item.canManage}<Button
        size="small"
        variant="ghost"
        disabled={busy}
        onclick={() => onUpdate({ locked: !item.locked })}>{item.locked ? 'Unlock' : 'Lock'}</Button
      >{/if}
  </div>
</section>
