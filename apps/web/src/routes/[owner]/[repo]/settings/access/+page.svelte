<script lang="ts">
  import { page } from '$app/stores';
  import { untrack } from 'svelte';
  import Trash2 from 'lucide-svelte/icons/trash-2';
  import Button from '$lib/components/Button.svelte';
  import Modal from '$lib/components/Modal.svelte';
  import Select from '$lib/components/Select.svelte';
  import UserAvatar from '$lib/components/UserAvatar.svelte';
  import { api, MarlApiError } from '$lib/api';
  import type { PageData } from './$types';

  type Person = { id: string; handle: string; displayName: string; avatarUrl?: string | null; role?: string };
  type Team = { id: string; name: string; slug: string; role?: string; members?: number };
  const roles = ['read', 'triage', 'write', 'maintain', 'admin'].map((value) => ({ value, label: value[0].toUpperCase() + value.slice(1) }));
  let { data } = $props<{ data: PageData }>();
  let collaborators = $state(untrack(() => data.collaborators as Person[]));
  let teams = $state(untrack(() => data.teams as Team[]));
  let dialog = $state<'person' | 'team' | null>(null);
  let selectedPerson = $state('');
  let selectedTeam = $state('');
  let role = $state('read');
  let error = $state('');
  const base = $derived(`/repositories/${$page.params.owner}/${$page.params.repo}/access`);
  const peopleOptions = $derived((data.availableMembers as Person[]).filter((person) => !collaborators.some((item) => item.id === person.id)).map((person) => ({ value: person.id, label: person.displayName, description: `@${person.handle}` })));
  const teamOptions = $derived((data.availableTeams as Team[]).filter((team) => !teams.some((item) => item.id === team.id)).map((team) => ({ value: team.id, label: team.name, description: team.slug })));

  async function save() {
    error = '';
    try {
      if (dialog === 'person') {
        const result = await api<{ collaborator: Person }>(`${base}/collaborators`, { method: 'PUT', body: JSON.stringify({ userId: selectedPerson, role }) });
        const source = (data.availableMembers as Person[]).find((person) => person.id === selectedPerson);
        collaborators = [...collaborators, { ...result.collaborator, displayName: source?.displayName ?? result.collaborator.handle, avatarUrl: source?.avatarUrl }];
      } else if (dialog === 'team') {
        const result = await api<{ team: Team }>(`${base}/teams`, { method: 'PUT', body: JSON.stringify({ teamId: selectedTeam, role }) });
        const source = (data.availableTeams as Team[]).find((team) => team.id === selectedTeam);
        teams = [...teams, { ...result.team, slug: source?.slug ?? '', members: 0 }];
      }
      dialog = null;
    } catch (cause) { error = cause instanceof MarlApiError ? cause.message : 'Access could not be updated.'; }
  }

  async function remove(kind: 'collaborators' | 'teams', id: string) {
    await api(`${base}/${kind}/${id}`, { method: 'DELETE' });
    if (kind === 'collaborators') collaborators = collaborators.filter((item) => item.id !== id);
    else teams = teams.filter((item) => item.id !== id);
  }

  async function updateRole(kind: 'collaborators' | 'teams', id: string, nextRole: string) {
    await api(`${base}/${kind}`, { method: 'PUT', body: JSON.stringify(kind === 'collaborators' ? { userId: id, role: nextRole } : { teamId: id, role: nextRole }) });
    if (kind === 'collaborators') collaborators = collaborators.map((item) => item.id === id ? { ...item, role: nextRole } : item);
    else teams = teams.map((item) => item.id === id ? { ...item, role: nextRole } : item);
  }
</script>

<svelte:head><title>Access · {$page.params.owner}/{$page.params.repo} · Marl</title></svelte:head>
<header class="page-head"><h2>Access</h2><p>People and teams with explicit access to this repository.</p></header>
{#if error}<p class="error" role="alert">{error}</p>{/if}
<section><header><div><h3>Collaborators</h3><p>Direct repository access, independent of team membership.</p></div><Button onclick={() => { selectedPerson = peopleOptions[0]?.value ?? ''; role = 'read'; dialog = 'person'; }}>Add collaborator</Button></header><div class="access-list">{#each collaborators as person}<article><UserAvatar name={person.displayName} src={person.avatarUrl} size={28} /><div><strong>{person.displayName}</strong><small>@{person.handle}</small></div><div class="role-select"><Select value={person.role ?? 'read'} options={roles} ariaLabel={`Role for ${person.handle}`} onchange={(value) => updateRole('collaborators', person.id, value)} /></div><Button variant="danger-soft" size="small" icon aria-label={`Remove ${person.handle}`} onclick={() => remove('collaborators', person.id)}><Trash2 size={14} /></Button></article>{:else}<p class="empty">No direct collaborators.</p>{/each}</div></section>
<section><header><div><h3>Teams</h3><p>Access inherited by everyone currently in a team.</p></div><Button onclick={() => { selectedTeam = teamOptions[0]?.value ?? ''; role = 'read'; dialog = 'team'; }}>Add team</Button></header><div class="access-list">{#each teams as team}<article><span class="team-avatar">{team.name.slice(0,2).toUpperCase()}</span><div><strong>{team.name}</strong><small>{team.members ?? 0} members</small></div><div class="role-select"><Select value={team.role ?? 'read'} options={roles} ariaLabel={`Role for ${team.name}`} onchange={(value) => updateRole('teams', team.id, value)} /></div><Button variant="danger-soft" size="small" icon aria-label={`Remove ${team.name}`} onclick={() => remove('teams', team.id)}><Trash2 size={14} /></Button></article>{:else}<p class="empty">No teams have explicit access.</p>{/each}</div></section>

{#snippet accessActions()}<Button size="small" onclick={() => (dialog = null)}>Cancel</Button><Button size="small" variant="primary" disabled={dialog === 'person' ? !selectedPerson : !selectedTeam} onclick={save}>Grant access</Button>{/snippet}
<Modal open={dialog !== null} title={dialog === 'person' ? 'Add collaborator' : 'Add team'} description="Choose the least privilege they need. You can change it later." onClose={() => (dialog = null)} actions={accessActions}><div class="dialog-form">{#if dialog === 'person'}<label><span>Person</span><Select bind:value={selectedPerson} options={peopleOptions} ariaLabel="Person" /></label>{:else}<label><span>Team</span><Select bind:value={selectedTeam} options={teamOptions} ariaLabel="Team" /></label>{/if}<label><span>Role</span><Select bind:value={role} options={roles} ariaLabel="Repository role" /></label></div></Modal>

<style>
  .page-head{padding-bottom:22px;border-bottom:1px solid var(--border-subtle)}h2{margin:0;color:var(--text-strong);font-size:22px}p{margin:6px 0 0;color:var(--text-muted);font-size:10px;line-height:1.5}section{padding:25px 0;border-bottom:1px solid var(--border-subtle)}section>header{display:flex;align-items:center;justify-content:space-between;gap:20px}h3{margin:0;color:var(--text-strong);font-size:13px}.access-list{margin-top:13px}.access-list article{display:grid;grid-template-columns:32px minmax(0,1fr) 150px 32px;align-items:center;gap:10px;min-height:54px;border-top:1px solid var(--border-subtle)}.team-avatar{display:grid;width:28px;height:28px;place-items:center;border-radius:6px;background:var(--brand-soft);color:var(--brand-strong);font-size:9px;font-weight:750}article strong,article small{display:block}article strong{color:var(--text-strong);font-size:10px}article small{margin-top:2px;color:var(--text-faint);font-size:9px}.role-select{width:150px}.empty{padding:16px 0}.error{padding:9px;border-radius:6px;background:var(--danger-soft);color:var(--danger)}.dialog-form,.dialog-form label{display:grid;gap:8px}.dialog-form{gap:16px}.dialog-form label>span{color:var(--text-strong);font-size:10px;font-weight:620}
</style>
