<script lang="ts">
  import type { IssueDetail, IssueLabel, IssuePerson } from '@marl/contracts';
  import Check from 'lucide-svelte/icons/check';
  import Lock from 'lucide-svelte/icons/lock';
  import Pencil from 'lucide-svelte/icons/pencil';
  import Plus from 'lucide-svelte/icons/plus';
  import Search from 'lucide-svelte/icons/search';
  import Tag from 'lucide-svelte/icons/tag';
  import UserRound from 'lucide-svelte/icons/user-round';
  import Unlock from 'lucide-svelte/icons/unlock';
  import { dismissable } from '$lib/actions/dismissable';
  import Button from '$lib/components/Button.svelte';
  import UserAvatar from '$lib/components/UserAvatar.svelte';
  import UserProfileLink from '$lib/components/UserProfileLink.svelte';

  let { issue, busy, onUpdate, onCreateLabel } = $props<{ issue: IssueDetail; busy: boolean; onUpdate: (body: { assigneeIds?: string[]; labelIds?: string[]; locked?: boolean }) => Promise<void>; onCreateLabel: (name: string) => Promise<void> }>();
  let open = $state<'assignees' | 'labels' | null>(null);
  let query = $state('');
  let creating = $state(false);
  const matchingAssignees = $derived(issue.availableAssignees.filter((person: IssuePerson) => `${person.displayName} ${person.handle}`.toLowerCase().includes(query.trim().toLowerCase())));
  const matchingLabels = $derived(issue.availableLabels.filter((label: IssueLabel) => `${label.name} ${label.description}`.toLowerCase().includes(query.trim().toLowerCase())));
  const labelName = $derived(query.trim().replace(/\s+/g, ' '));
  const canCreate = $derived(Boolean(labelName) && !issue.availableLabels.some((label: IssueLabel) => label.name.toLowerCase() === labelName.toLowerCase()));
  function toggle(picker: 'assignees' | 'labels') { open = open === picker ? null : picker; query = ''; }
  function toggleAssignee(id: string) { const ids = issue.assignees.map((person: IssuePerson) => person.id); return onUpdate({ assigneeIds: ids.includes(id) ? ids.filter((value: string) => value !== id) : [...ids, id] }); }
  function toggleLabel(id: string) { const ids = issue.labels.map((label: IssueLabel) => label.id); return onUpdate({ labelIds: ids.includes(id) ? ids.filter((value: string) => value !== id) : [...ids, id] }); }
  async function createLabel() { if (!canCreate || creating) return; creating = true; try { await onCreateLabel(labelName); query = ''; } finally { creating = false; } }
</script>

<svelte:window onkeydown={(event) => event.key === 'Escape' && (open = null)} />
<section class="metadata">
  <div class="field" use:dismissable={() => open === 'assignees' && (open = null)}><header><span><UserRound size={13} />Assignees</span>{#if issue.canManage}<Button icon size="small" variant="ghost" aria-label="Edit assignees" aria-expanded={open === 'assignees'} onclick={() => toggle('assignees')}><Pencil size={12} /></Button>{/if}</header><div class="people">{#each issue.assignees as person (person.id)}<UserProfileLink handle={person.handle} displayName={person.displayName || person.handle} avatarUrl={person.avatarUrl} size={24} />{:else}<span class="empty">No one assigned</span>{/each}</div>{#if open === 'assignees'}<div class="picker"><label><Search size={13} /><input bind:value={query} placeholder="Find a person" /></label><div>{#each matchingAssignees as person (person.id)}<Button class="option" variant="ghost" block disabled={busy} onclick={() => toggleAssignee(person.id)}><span><UserAvatar name={person.displayName || person.handle} src={person.avatarUrl} size={23} /><span><strong>{person.displayName || person.handle}</strong><small>@{person.handle}</small></span></span>{#if issue.assignees.some((item: IssuePerson) => item.id === person.id)}<Check size={14} />{/if}</Button>{:else}<p>No matching people</p>{/each}</div></div>{/if}</div>
  <div class="field" use:dismissable={() => open === 'labels' && (open = null)}><header><span><Tag size={13} />Labels</span>{#if issue.canManage}<Button icon size="small" variant="ghost" aria-label="Edit labels" aria-expanded={open === 'labels'} onclick={() => toggle('labels')}><Pencil size={12} /></Button>{/if}</header><div class="labels">{#each issue.labels as label (label.id)}<span style:--label-color={label.color}><i></i>{label.name}</span>{:else}<span class="empty">No labels</span>{/each}</div>{#if open === 'labels'}<div class="picker"><label><Search size={13} /><input bind:value={query} onkeydown={(event) => event.key === 'Enter' && canCreate && createLabel()} placeholder="Find or create a label" /></label><div>{#each matchingLabels as label (label.id)}<Button class="option" variant="ghost" block disabled={busy || creating} onclick={() => toggleLabel(label.id)}><span><b style:background={label.color}></b><span><strong>{label.name}</strong>{#if label.description}<small>{label.description}</small>{/if}</span></span>{#if issue.labels.some((item: IssueLabel) => item.id === label.id)}<Check size={14} />{/if}</Button>{/each}{#if canCreate}<Button class="create" variant="ghost" block loading={creating} onclick={createLabel}><Plus size={14} />Create “{labelName}”</Button>{:else if !matchingLabels.length}<p>No matching labels</p>{/if}</div></div>{/if}</div>
  <div class="lock"><span>{#if issue.locked}<Lock size={13} />Conversation locked{:else}<Unlock size={13} />Conversation open{/if}</span>{#if issue.canManage}<Button size="small" variant="ghost" disabled={busy} onclick={() => onUpdate({ locked: !issue.locked })}>{issue.locked ? 'Unlock' : 'Lock'}</Button>{/if}</div>
</section>

<style>
  .metadata{margin-top:12px;border-top:1px solid var(--border-subtle)}.field{position:relative;padding:12px 0;border-bottom:1px solid var(--border-subtle)}.field>header{display:flex;height:30px;align-items:center;justify-content:space-between}.field>header>span,.lock>span{display:flex;align-items:center;gap:6px;color:var(--text-muted);font-size:10px;font-weight:630}.people{display:grid;gap:7px;margin-top:7px}.people :global(.user-profile-link){font-size:10px}.labels{display:flex;flex-wrap:wrap;gap:5px;margin-top:7px}.labels>span:not(.empty){display:inline-flex;align-items:center;gap:5px;padding:4px 7px;border-radius:5px;background:color-mix(in srgb,var(--label-color) 15%,transparent);color:var(--label-color);font-size:9px;font-weight:650}.labels i{width:6px;height:6px;border-radius:50%;background:currentColor}.empty{color:var(--text-faint);font-size:9px}.picker{position:absolute;z-index:40;top:48px;right:0;width:300px;overflow:hidden;border:1px solid var(--border-strong);border-radius:9px;background:var(--surface-raised);box-shadow:var(--shadow-card)}.picker>label{display:flex;height:34px;align-items:center;gap:7px;margin:7px;padding:0 9px;border:1px solid var(--border);border-radius:6px;color:var(--text-faint)}.picker input{min-width:0;width:100%;border:0;outline:0;background:transparent;color:var(--text-strong);font-size:10px}.picker>div{display:grid;max-height:290px;overflow-y:auto;padding:4px;border-top:1px solid var(--border-subtle)}.picker :global(.option.button){height:auto;min-height:43px;justify-content:space-between;padding:7px;text-align:left}.picker :global(.option.button > span){display:flex;align-items:center;gap:8px}.picker :global(.option.button b){width:10px;height:10px;border-radius:50%}.picker :global(.option.button strong),.picker :global(.option.button small){display:block}.picker :global(.option.button strong){font-size:10px}.picker :global(.option.button small){margin-top:2px;color:var(--text-faint);font-size:8px}.picker p{padding:16px;text-align:center;color:var(--text-faint);font-size:9px}.picker :global(.create.button){justify-content:flex-start;border-top:1px solid var(--border-subtle);font-size:10px}.lock{display:flex;min-height:48px;align-items:center;justify-content:space-between}
</style>
