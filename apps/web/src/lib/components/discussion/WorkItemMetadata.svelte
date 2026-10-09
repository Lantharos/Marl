<script lang="ts">
  import type { WorkItemLabel, WorkItemPerson } from '@marl/contracts';
  import Lock from '@lucide/svelte/icons/lock';
  import Pencil from '@lucide/svelte/icons/pencil';
  import Unlock from '@lucide/svelte/icons/lock-open';
  import Button from '../controls/Button.svelte';
  import UserProfileLink from '../identity/UserProfileLink.svelte';
  import MetadataPicker from '../overlays/MetadataPicker.svelte';
  import type { PopoverTrigger } from '../overlays/Popover.svelte';
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

{#snippet editButton(title: string, popover: PopoverTrigger)}
  <Button
    icon
    size="small"
    variant="ghost"
    aria-label={`Edit ${title.toLowerCase()}`}
    onclick={() => (query = '')}
    {...popover}><Pencil size={13} /></Button
  >
{/snippet}

<section class="grid gap-6">
  <div>
    <div class="flex h-7 items-center justify-between">
      <h3 class="text-xs font-semibold text-ink-muted">Assignees</h3>
      {#if item.canManage}
        <MetadataPicker
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
        >
          {#snippet trigger(popover)}{@render editButton('Assignees', popover)}{/snippet}
        </MetadataPicker>
      {/if}
    </div>
    <div class="mt-2 grid gap-2">
      {#each item.assignees as person (person.id)}<UserProfileLink
          handle={person.handle}
          displayName={person.displayName || person.handle}
          avatarUrl={person.avatarUrl}
          size={24}
        />{:else}<span class="text-sm text-ink-faint">No one assigned</span>{/each}
    </div>
  </div>

  <div>
    <div class="flex h-7 items-center justify-between">
      <h3 class="text-xs font-semibold text-ink-muted">Labels</h3>
      {#if item.canManage}
        <MetadataPicker
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
        >
          {#snippet trigger(popover)}{@render editButton('Labels', popover)}{/snippet}
        </MetadataPicker>
      {/if}
    </div>
    <div class="mt-2 flex flex-wrap gap-1.5">
      {#each item.labels as label (label.id)}<LabelPill name={label.name} color={label.color} />{:else}<span
          class="text-sm text-ink-faint">No labels</span
        >{/each}
    </div>
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
