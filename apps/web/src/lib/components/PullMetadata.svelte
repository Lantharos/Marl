<script lang="ts">
  import type { PullRequestDetail, PullRequestLabel, PullRequestPerson } from '@sty/contracts';
  import Check from 'lucide-svelte/icons/check';
  import ChevronDown from 'lucide-svelte/icons/chevron-down';
  import Lock from 'lucide-svelte/icons/lock';
  import Tag from 'lucide-svelte/icons/tag';
  import UserRound from 'lucide-svelte/icons/user-round';
  import Unlock from 'lucide-svelte/icons/unlock';
  import { dismissable } from '$lib/actions/dismissable';
  import UserAvatar from './UserAvatar.svelte';

  let { pull, busy, onUpdate } = $props<{ pull: PullRequestDetail; busy: boolean; onUpdate: (body: { assigneeIds?: string[]; labelIds?: string[]; locked?: boolean }) => Promise<void> }>();
  let assigneesOpen = $state(false);
  let labelsOpen = $state(false);

  function toggleAssignee(id: string) {
    const selected = pull.assignees.map((person: PullRequestPerson) => person.id);
    return onUpdate({ assigneeIds: selected.includes(id) ? selected.filter((value: string) => value !== id) : [...selected, id] });
  }

  function toggleLabel(id: string) {
    const selected = pull.labels.map((label: PullRequestLabel) => label.id);
    return onUpdate({ labelIds: selected.includes(id) ? selected.filter((value: string) => value !== id) : [...selected, id] });
  }
</script>

<section class="metadata">
  <div class="field" use:dismissable={() => (assigneesOpen = false)}>
    <button class="field-title" onclick={() => (assigneesOpen = !assigneesOpen)}><span><UserRound size={13} />Assignees</span><ChevronDown size={12} /></button>
    <div class="values">{#each pull.assignees as person}<span class="person"><UserAvatar name={person.displayName || person.handle} src={person.avatarUrl} size={21} />{person.handle}</span>{:else}<span class="empty">No one assigned</span>{/each}</div>
    {#if assigneesOpen}<div class="menu"><header>Assign people</header>{#each pull.availableAssignees as person}<button disabled={busy} onclick={() => toggleAssignee(person.id)}><span><UserAvatar name={person.displayName || person.handle} src={person.avatarUrl} size={21} /><span><strong>{person.handle}</strong><small>{person.displayName}</small></span></span>{#if pull.assignees.some((item: PullRequestPerson) => item.id === person.id)}<Check size={14} />{/if}</button>{/each}</div>{/if}
  </div>
  <div class="field" use:dismissable={() => (labelsOpen = false)}>
    <button class="field-title" onclick={() => (labelsOpen = !labelsOpen)}><span><Tag size={13} />Labels</span><ChevronDown size={12} /></button>
    <div class="values labels">{#each pull.labels as label}<span style:--label-color={label.color}>{label.name}</span>{:else}<span class="empty">No labels</span>{/each}</div>
    {#if labelsOpen}<div class="menu"><header>Apply labels</header>{#each pull.availableLabels as label}<button disabled={busy} onclick={() => toggleLabel(label.id)}><span><b style:background={label.color}></b><span><strong>{label.name}</strong><small>{label.description}</small></span></span>{#if pull.labels.some((item: PullRequestLabel) => item.id === label.id)}<Check size={14} />{/if}</button>{/each}</div>{/if}
  </div>
  <div class="conversation-state"><span>{#if pull.locked}<Lock size={13} />Conversation locked{:else}<Unlock size={13} />Conversation open{/if}</span>{#if pull.canManage}<button disabled={busy} onclick={() => onUpdate({ locked: !pull.locked })}>{pull.locked ? 'Unlock' : 'Lock'}</button>{/if}</div>
</section>

<style>
  .metadata{margin-top:12px;border-top:1px solid var(--border-subtle)}.field{position:relative;padding:12px 2px;border-bottom:1px solid var(--border-subtle)}.field-title{display:flex;width:100%;align-items:center;justify-content:space-between;padding:0;border:0;background:transparent;color:var(--text-muted);cursor:pointer;font-size:10px;font-weight:630}.field-title>span{display:flex;align-items:center;gap:6px}.values{display:flex;flex-wrap:wrap;gap:6px;margin-top:9px}.person{display:flex;align-items:center;gap:6px;color:var(--text);font-size:10px}.person i,.menu i{display:grid;width:21px;height:21px;place-items:center;border-radius:50%;background:#d5b496;color:#3d2518;font-size:7px;font-style:normal;font-weight:740}.empty{color:var(--text-faint);font-size:9px}.labels>span:not(.empty){padding:4px 7px;border-radius:99px;background:color-mix(in srgb,var(--label-color) 18%,transparent);color:var(--label-color);font-size:9px;font-weight:650}.menu{position:absolute;z-index:40;top:39px;right:0;width:280px;padding:5px;border:1px solid var(--border-strong);border-radius:8px;background:var(--surface-raised);box-shadow:var(--shadow-card)}.menu header{padding:7px 8px;color:var(--text-faint);font-size:9px;font-weight:630}.menu button{display:flex;width:100%;min-height:44px;align-items:center;justify-content:space-between;padding:6px 8px;border:0;border-radius:5px;background:transparent;color:var(--brand);cursor:pointer;text-align:left}.menu button:hover{background:var(--surface-muted)}.menu button>span{display:flex;min-width:0;align-items:center;gap:8px}.menu button b{width:10px;height:10px;border-radius:50%}.menu strong,.menu small{display:block}.menu strong{color:var(--text-strong);font-size:10px}.menu small{overflow:hidden;max-width:205px;margin-top:2px;color:var(--text-faint);font-size:8px;text-overflow:ellipsis;white-space:nowrap}.conversation-state{display:flex;align-items:center;justify-content:space-between;padding:12px 2px;color:var(--text-muted);font-size:9px}.conversation-state span{display:flex;align-items:center;gap:6px}.conversation-state button{height:26px;padding:0 8px;border:1px solid var(--border);border-radius:5px;background:var(--surface);color:var(--text-muted);cursor:pointer;font-size:9px}.conversation-state button:hover{background:var(--surface-muted);color:var(--text-strong)}
</style>
