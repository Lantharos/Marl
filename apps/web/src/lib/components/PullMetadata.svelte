<script lang="ts">
  import { onMount, tick } from 'svelte';
  import type { PullRequestDetail, PullRequestLabel, PullRequestPerson } from '@marl/contracts';
  import Check from 'lucide-svelte/icons/check';
  import Lock from 'lucide-svelte/icons/lock';
  import Pencil from 'lucide-svelte/icons/pencil';
  import Plus from 'lucide-svelte/icons/plus';
  import Search from 'lucide-svelte/icons/search';
  import Tag from 'lucide-svelte/icons/tag';
  import UserRound from 'lucide-svelte/icons/user-round';
  import Unlock from 'lucide-svelte/icons/unlock';
  import { dismissable } from '$lib/actions/dismissable';
  import { positionFloatingPanel } from '$lib/ui/floating';
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
  let pickerPanel = $state<HTMLDivElement>();
  let creatingLabel = $state(false);
  let frame = 0;

  const matchingAssignees = $derived(pull.availableAssignees.filter((person: PullRequestPerson) => `${person.displayName} ${person.handle}`.toLowerCase().includes(assigneeQuery.trim().toLowerCase())));
  const matchingLabels = $derived(pull.availableLabels.filter((label: PullRequestLabel) => `${label.name} ${label.description}`.toLowerCase().includes(labelQuery.trim().toLowerCase())));
  const cleanLabelName = $derived(labelQuery.trim().replace(/\s+/g, ' '));
  const canCreateLabel = $derived(Boolean(cleanLabelName) && !pull.availableLabels.some((label: PullRequestLabel) => label.name.toLowerCase() === cleanLabelName.toLowerCase()));

  function positionPicker() {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      if (open && pickerAnchor && pickerPanel) positionFloatingPanel(pickerAnchor, pickerPanel, 300);
    });
  }

  async function openPicker(picker: 'assignees' | 'labels', event: MouseEvent) {
    if (!pull.canManage) return;
    open = open === picker ? null : picker;
    pickerAnchor = event.currentTarget as HTMLElement;
    await tick();
    if (!open) return;
    positionPicker();
    searchInput?.focus();
  }

  function keydown(event: KeyboardEvent) {
    if (open && event.key === 'Escape') open = null;
  }

  onMount(() => {
    const reposition = () => open && positionPicker();
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition, true);
    };
  });

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
    <header><span><UserRound size={13} />Assignees</span>{#if pull.canManage}<Button icon size="small" variant="ghost" aria-label="Edit assignees" aria-expanded={open === 'assignees'} onclick={(event) => openPicker('assignees', event)}><Pencil size={12} /></Button>{/if}</header>
    <div class="people">{#each pull.assignees as person}<UserProfileLink handle={person.handle} displayName={person.displayName || person.handle} avatarUrl={person.avatarUrl} size={24} />{:else}<span class="empty">No one assigned</span>{/each}</div>
    {#if open === 'assignees'}
      <div class="picker" bind:this={pickerPanel}>
        <label class="search"><Search size={13} /><input bind:this={searchInput} bind:value={assigneeQuery} placeholder="Find a person" /></label>
        <div class="options">{#each matchingAssignees as person}<Button class="option" variant="ghost" block disabled={busy} onclick={() => toggleAssignee(person.id)}><span class="option-main"><UserAvatar name={person.displayName || person.handle} src={person.avatarUrl} size={23} /><span><strong>{person.displayName || person.handle}</strong><small>@{person.handle}</small></span></span>{#if pull.assignees.some((item: PullRequestPerson) => item.id === person.id)}<Check size={14} />{/if}</Button>{:else}<p>No matching people</p>{/each}</div>
      </div>
    {/if}
  </div>

  <div class="field" use:dismissable={() => open === 'labels' && (open = null)}>
    <header><span><Tag size={13} />Labels</span>{#if pull.canManage}<Button icon size="small" variant="ghost" aria-label="Edit labels" aria-expanded={open === 'labels'} onclick={(event) => openPicker('labels', event)}><Pencil size={12} /></Button>{/if}</header>
    <div class="labels">{#each pull.labels as label}<span style:--label-color={label.color}><i></i>{label.name}</span>{:else}<span class="empty">No labels</span>{/each}</div>
    {#if open === 'labels'}
      <div class="picker" bind:this={pickerPanel}>
        <label class="search"><Search size={13} /><input bind:this={searchInput} bind:value={labelQuery} onkeydown={(event) => event.key === 'Enter' && canCreateLabel && createLabel()} placeholder="Find or create a label" /></label>
        <div class="options">
          {#each matchingLabels as label}<Button class="option" variant="ghost" block disabled={busy || creatingLabel} onclick={() => toggleLabel(label.id)}><span class="option-main"><b style:background={label.color}></b><span><strong>{label.name}</strong>{#if label.description}<small>{label.description}</small>{/if}</span></span>{#if pull.labels.some((item: PullRequestLabel) => item.id === label.id)}<Check size={14} />{/if}</Button>{/each}
          {#if canCreateLabel}<Button class="create-option" variant="ghost" block loading={creatingLabel} onclick={createLabel}><Plus size={14} /><span>Create <strong>“{cleanLabelName}”</strong></span></Button>{:else if matchingLabels.length === 0}<p>No matching labels</p>{/if}
        </div>
      </div>
    {/if}
  </div>

  <div class="conversation-state"><span>{#if pull.locked}<Lock size={13} />Conversation locked{:else}<Unlock size={13} />Conversation open{/if}</span>{#if pull.canManage}<Button size="small" variant="ghost" disabled={busy} onclick={() => onUpdate({ locked: !pull.locked })}>{pull.locked ? 'Unlock' : 'Lock'}</Button>{/if}</div>
</section>

<style>
  .metadata{margin-top:12px;border-top:1px solid var(--border-subtle)}.field{position:relative;padding:12px 0;border-bottom:1px solid var(--border-subtle)}.field>header{display:flex;height:30px;align-items:center;justify-content:space-between}.field>header>span{display:flex;align-items:center;gap:6px;color:var(--text-muted);font-size:10px;font-weight:630}.people{display:grid;gap:7px;margin-top:7px}.people :global(.user-profile-link){font-size:10px}.labels{display:flex;flex-wrap:wrap;gap:5px;margin-top:7px}.labels>span:not(.empty){display:inline-flex;align-items:center;gap:5px;padding:4px 7px;border-radius:5px;background:color-mix(in srgb,var(--label-color) 15%,transparent);color:var(--label-color);font-size:9px;font-weight:650}.labels i{width:6px;height:6px;border-radius:50%;background:currentColor}.empty{color:var(--text-faint);font-size:9px}.picker{position:fixed;z-index:90;overflow-y:auto;border:1px solid var(--border-strong);border-radius:9px;background:var(--surface-raised);box-shadow:var(--shadow-card)}.search{display:flex;align-items:center;gap:7px;margin:7px;padding:0 9px;border:1px solid var(--border);border-radius:6px;color:var(--text-faint)}.search:focus-within{border-color:var(--brand)}.search input{min-width:0;width:100%;height:32px;border:0;outline:0;background:transparent;color:var(--text-strong);font-size:10px}.options{max-height:310px;overflow-y:auto;padding:0 5px 5px;border-top:1px solid var(--border-subtle)}.options :global(.option.button){height:auto;min-height:45px;justify-content:space-between;padding:7px 8px;text-align:left;white-space:normal}.option-main{display:flex;min-width:0;align-items:center;gap:8px}.option-main>b{width:10px;height:10px;flex:0 0 auto;border-radius:50%}.option-main strong,.option-main small{display:block}.option-main strong{color:var(--text-strong);font-size:10px}.option-main small{overflow:hidden;max-width:220px;margin-top:2px;color:var(--text-faint);font-size:8px;text-overflow:ellipsis;white-space:nowrap}.options :global(.create-option.button){height:auto;min-height:42px;justify-content:flex-start;margin-top:3px;padding:7px 8px;border-top:1px solid var(--border-subtle);font-size:10px;white-space:normal}.options :global(.create-option strong){color:var(--text-strong)}.options>p{margin:0;padding:20px 8px;color:var(--text-faint);font-size:9px;text-align:center}.conversation-state{display:flex;min-height:48px;align-items:center;justify-content:space-between;color:var(--text-muted);font-size:9px}.conversation-state>span{display:flex;align-items:center;gap:6px}
</style>
