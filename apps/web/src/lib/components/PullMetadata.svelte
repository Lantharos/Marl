<script lang="ts">
  import { tick } from 'svelte';
  import type { PullRequestDetail, PullRequestLabel, PullRequestPerson } from '@marl/contracts';
  import Check from 'lucide-svelte/icons/check';
  import Lock from 'lucide-svelte/icons/lock';
  import Pencil from 'lucide-svelte/icons/pencil';
  import Plus from 'lucide-svelte/icons/plus';
  import Search from 'lucide-svelte/icons/search';
  import Unlock from 'lucide-svelte/icons/unlock';
  import { dismissable } from '$lib/actions/dismissable';
  import { anchoredPopover, popoverMotion } from '$lib/ui/popover';
  import '$lib/styles/metadata-picker.css';
  import Button from './Button.svelte';
  import UserAvatar from './UserAvatar.svelte';
  import UserProfileLink from './UserProfileLink.svelte';

  let { pull, busy, onUpdate, onCreateLabel } = $props<{
    pull: PullRequestDetail;
    busy: boolean;
    onUpdate: (body: { assigneeIds?: string[]; labelIds?: string[]; locked?: boolean }) => Promise<void>;
    onCreateLabel: (name: string) => Promise<void>;
  }>();

  let open = $state<'assignees' | 'labels' | null>(null);
  let assigneeQuery = $state('');
  let labelQuery = $state('');
  let searchInput = $state<HTMLInputElement>();
  let pickerAnchor = $state<HTMLElement>();
  let creatingLabel = $state(false);

  const matchingAssignees = $derived(pull.availableAssignees.filter((person: PullRequestPerson) => `${person.displayName} ${person.handle}`.toLowerCase().includes(assigneeQuery.trim().toLowerCase())));
  const matchingLabels = $derived(pull.availableLabels.filter((label: PullRequestLabel) => `${label.name} ${label.description}`.toLowerCase().includes(labelQuery.trim().toLowerCase())));
  const cleanLabelName = $derived(labelQuery.trim().replace(/\s+/g, ' '));
  const canCreateLabel = $derived(Boolean(cleanLabelName) && !pull.availableLabels.some((label: PullRequestLabel) => label.name.toLowerCase() === cleanLabelName.toLowerCase()));

  async function openPicker(picker: 'assignees' | 'labels', event: MouseEvent) {
    if (!pull.canManage) return;
    open = open === picker ? null : picker;
    pickerAnchor = event.currentTarget as HTMLElement;
    await tick();
    if (!open) return;
    searchInput?.focus();
  }

  function keydown(event: KeyboardEvent) {
    if (!open || event.key !== 'Escape') return;
    event.stopPropagation();
    open = null;
    pickerAnchor?.focus();
  }

  function toggleAssignee(id: string) {
    const selected = pull.assignees.map((person: PullRequestPerson) => person.id);
    return onUpdate({ assigneeIds: selected.includes(id) ? selected.filter((value: string) => value !== id) : [...selected, id] });
  }

  function toggleLabel(id: string) {
    const selected = pull.labels.map((label: PullRequestLabel) => label.id);
    return onUpdate({ labelIds: selected.includes(id) ? selected.filter((value: string) => value !== id) : [...selected, id] });
  }

  async function createLabel() {
    if (!canCreateLabel || creatingLabel) return;
    creatingLabel = true;
    try {
      await onCreateLabel(cleanLabelName);
      labelQuery = '';
    } finally {
      creatingLabel = false;
    }
  }
</script>

<svelte:window onkeydown={keydown} />

<section class="metadata">
  <div class="field" use:dismissable={() => open === 'assignees' && (open = null)}>
    <header><span>Assignees</span>{#if pull.canManage}<Button icon size="small" variant="ghost" aria-label="Edit assignees" aria-expanded={open === 'assignees'} onclick={(event) => openPicker('assignees', event)}><Pencil size={12} /></Button>{/if}</header>
    <div class="people">{#each pull.assignees as person (person.id)}<UserProfileLink handle={person.handle} displayName={person.displayName || person.handle} avatarUrl={person.avatarUrl} size={24} />{:else}<span class="empty">No one assigned</span>{/each}</div>
    {#if open === 'assignees'}
      <div class="metadata-picker" {@attach anchoredPopover(pickerAnchor)} transition:popoverMotion>
        <label class="picker-search"><Search size={13} /><input bind:this={searchInput} bind:value={assigneeQuery} aria-label="Find a person" placeholder="Find a person" /></label>
        <div class="picker-options">{#each matchingAssignees as person (person.id)}<Button class="picker-choice" variant="ghost" block disabled={busy} aria-pressed={pull.assignees.some((item: PullRequestPerson) => item.id === person.id)} onclick={() => toggleAssignee(person.id)}><span ><UserAvatar name={person.displayName || person.handle} src={person.avatarUrl} size={26} /><span><strong>{person.displayName || person.handle}</strong><small>@{person.handle}</small></span></span>{#if pull.assignees.some((item: PullRequestPerson) => item.id === person.id)}<Check size={14} />{/if}</Button>{:else}<p>No matching people</p>{/each}</div>
      </div>
    {/if}
  </div>

  <div class="field" use:dismissable={() => open === 'labels' && (open = null)}>
    <header><span>Labels</span>{#if pull.canManage}<Button icon size="small" variant="ghost" aria-label="Edit labels" aria-expanded={open === 'labels'} onclick={(event) => openPicker('labels', event)}><Pencil size={12} /></Button>{/if}</header>
    <div class="labels">{#each pull.labels as label (label.id)}<span style:--label-color={label.color}><i></i>{label.name}</span>{:else}<span class="empty">No labels</span>{/each}</div>
    {#if open === 'labels'}
      <div class="metadata-picker" {@attach anchoredPopover(pickerAnchor)} transition:popoverMotion>
        <label class="picker-search"><Search size={13} /><input bind:this={searchInput} bind:value={labelQuery} onkeydown={(event) => event.key === 'Enter' && canCreateLabel && createLabel()} aria-label="Find or create a label" placeholder="Find or create a label" /></label>
        <div class="picker-options">
          {#each matchingLabels as label (label.id)}<Button class="picker-choice" variant="ghost" block disabled={busy || creatingLabel} aria-pressed={pull.labels.some((item: PullRequestLabel) => item.id === label.id)} onclick={() => toggleLabel(label.id)}><span ><b style:background={label.color}></b><span><strong>{label.name}</strong>{#if label.description}<small>{label.description}</small>{/if}</span></span>{#if pull.labels.some((item: PullRequestLabel) => item.id === label.id)}<Check size={14} />{/if}</Button>{/each}
          {#if canCreateLabel}<Button class="create-choice" variant="ghost" block loading={creatingLabel} onclick={createLabel}><Plus size={14} /><span>Create <strong>“{cleanLabelName}”</strong></span></Button>{:else if matchingLabels.length === 0}<p>No matching labels</p>{/if}
        </div>
      </div>
    {/if}
  </div>

  <div class="conversation-state"><span>{#if pull.locked}<Lock size={13} />Conversation locked{:else}<Unlock size={13} />Conversation open{/if}</span>{#if pull.canManage}<Button size="small" variant="ghost" disabled={busy} onclick={() => onUpdate({ locked: !pull.locked })}>{pull.locked ? 'Unlock' : 'Lock'}</Button>{/if}</div>
</section>

<style>
  .metadata{display:grid;gap:24px;margin-top:25px}.field{position:relative}.field>header{display:flex;height:27px;align-items:center;justify-content:space-between}.field>header>span{display:flex;align-items:center;gap:6px;color:var(--text-muted);font-size:12px;font-weight:630}.people{display:grid;gap:7px;margin-top:7px}.people :global(.user-profile-link){font-size:12px}.labels{display:flex;flex-wrap:wrap;gap:5px;margin-top:7px}.labels>span:not(.empty){display:inline-flex;align-items:center;gap:5px;padding:5px 9px;border-radius:999px;background:color-mix(in srgb,var(--label-color) 15%,transparent);color:var(--label-color);font-size:12px;font-weight:650}.labels i{width:6px;height:6px;border-radius:50%;background:currentColor}.empty{color:var(--text-faint);font-size:12px}.conversation-state{display:flex;min-height:34px;align-items:center;justify-content:space-between;color:var(--text-muted);font-size:12px}.conversation-state>span{display:flex;align-items:center;gap:6px}
</style>
