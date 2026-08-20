<script lang="ts">
  import { page } from '$app/stores';
  import { untrack } from 'svelte';
  import Trash2 from 'lucide-svelte/icons/trash-2';
  import Button from '$lib/components/Button.svelte';
  import Modal from '$lib/components/Modal.svelte';
  import OrganizationSettingsShell from '$lib/components/settings/OrganizationSettingsShell.svelte';
  import Select from '$lib/components/Select.svelte';
  import SettingsAction from '$lib/components/settings/SettingsAction.svelte';
  import UserAvatar from '$lib/components/UserAvatar.svelte';
  import { api, MarlApiError } from '$lib/api';
  import { IdentityConfirmation } from '$lib/auth/identity-confirmation.svelte';
  import IdentityConfirmationModal from '$lib/components/auth/IdentityConfirmationModal.svelte';
  import type { PageData } from './$types';

  type Member = { id: string; handle: string; displayName: string; email: string | null; avatarUrl?: string | null; role: 'owner' | 'admin' | 'member' };
  type Team = { id: string; slug: string; name: string; description: string; members: number };
  type TeamMember = { teamId: string; userId: string; handle: string; displayName: string };
  type Invitation = { id: string; email: string; role: 'admin' | 'member'; expiresAt: string };
  let { data } = $props<{ data: PageData }>();
  let members = $state(untrack(() => data.members as Member[]));
  let teams = $state(untrack(() => data.teams as Team[]));
  let teamMembers = $state(untrack(() => data.teamMembers as TeamMember[]));
  let invitations = $state(untrack(() => data.invitations as Invitation[]));
  const organizationName = $derived(data.organization.name as string);
  let baseRole = $state(untrack(() => (data.organization.baseRepositoryRole as string | null) ?? 'read'));
  let dialog = $state<'invite' | 'team' | 'team-member' | 'delete-team' | null>(null);
  let inviteEmail = $state('');
  let memberRole = $state('member');
  let teamName = $state('');
  let teamSlug = $state('');
  let selectedTeam = $state('');
  let selectedUser = $state('');
  let busy = $state('');
  let saveState = $state<'idle' | 'saving' | 'saved'>('idle');
  let error = $state('');
  const confirmation = new IdentityConfirmation();
  const slug = $derived($page.params.slug ?? '');
  const canAdminister = $derived(data.viewerRole === 'owner' || data.viewerRole === 'admin');
  const isOwner = $derived(data.viewerRole === 'owner');
  const base = $derived(`/organizations/${slug}/access`);
  const memberRoles = [{ value: 'member', label: 'Member' }, { value: 'admin', label: 'Administrator' }];
  const repositoryRoles = ['read', 'triage', 'write', 'maintain'].map((value) => ({ value, label: value[0].toUpperCase() + value.slice(1) }));
  const teamOptions = $derived(teams.map((team) => ({ value: team.id, label: team.name, description: `${team.members} members` })));
  const userOptions = $derived(members.map((member) => ({ value: member.id, label: member.displayName, description: `@${member.handle}` })));

  async function run(key: string, action: () => Promise<void>) {
    busy = key; error = '';
    try { await action(); } catch (cause) { error = cause instanceof MarlApiError ? cause.message : 'Organization access could not be updated.'; } finally { busy = ''; }
  }

  async function saveSettings() {
    saveState = 'saving';
    await run('settings', async () => { await api(`/organizations/${slug}`, { method: 'PATCH', body: JSON.stringify({ baseRepositoryRole: baseRole }) }); });
    if (error) { saveState = 'idle'; return; }
    saveState = 'saved';
    setTimeout(() => (saveState = 'idle'), 1800);
  }
  function invite() { return run('invite', async () => { const result = await api<{ invitation: Invitation }>(`${base}/invitations`, { method: 'POST', body: JSON.stringify({ email: inviteEmail, role: memberRole }) }); invitations = [result.invitation, ...invitations]; dialog = null; inviteEmail = ''; }); }
  function createTeam() { return run('team', async () => { const result = await api<{ team: Team }>(`${base}/teams`, { method: 'POST', body: JSON.stringify({ name: teamName, slug: teamSlug }) }); teams = [...teams, result.team]; dialog = null; teamName = ''; teamSlug = ''; }); }
  function addTeamMember() { return run('team-member', async () => { await api(`${base}/teams/${selectedTeam}/members`, { method: 'POST', body: JSON.stringify({ userId: selectedUser }) }); const member = members.find((item) => item.id === selectedUser); if (member && !teamMembers.some((item) => item.teamId === selectedTeam && item.userId === selectedUser)) { teamMembers = [...teamMembers, { teamId: selectedTeam, userId: member.id, handle: member.handle, displayName: member.displayName }]; teams = teams.map((team) => team.id === selectedTeam ? { ...team, members: team.members + 1 } : team); } dialog = null; }); }
  function removeTeamMember(team: Team, member: TeamMember) { return run(`team-member-${team.id}-${member.userId}`, async () => { await api(`${base}/teams/${team.id}/members/${member.userId}`, { method: 'DELETE' }); teamMembers = teamMembers.filter((item) => item.teamId !== team.id || item.userId !== member.userId); teams = teams.map((item) => item.id === team.id ? { ...item, members: Math.max(0, item.members - 1) } : item); }); }
  function deleteTeam() { const teamId = selectedTeam; return run(`delete-team-${teamId}`, async () => { await api(`${base}/teams/${teamId}`, { method: 'DELETE' }); teams = teams.filter((team) => team.id !== teamId); teamMembers = teamMembers.filter((member) => member.teamId !== teamId); dialog = null; }); }
  async function changeMember(member: Member, role: string) { await run(`member-${member.id}`, async () => { await api(`${base}/members/${member.id}`, { method: 'PATCH', body: JSON.stringify({ role }) }); members = members.map((item) => item.id === member.id ? { ...item, role: role as 'admin' | 'member' } : item); }); }
  async function removeMember(member: Member) { await run(`remove-${member.id}`, async () => { await api(`${base}/members/${member.id}`, { method: 'DELETE' }); members = members.filter((item) => item.id !== member.id); }); }
  async function revokeInvitation(invitation: Invitation) { await api(`${base}/invitations/${invitation.id}`, { method: 'DELETE' }); invitations = invitations.filter((item) => item.id !== invitation.id); }
</script>

<svelte:head><title>{organizationName} access · Marl</title></svelte:head>
<OrganizationSettingsShell name={organizationName} {slug} avatarUrl={data.organization.avatarUrl} active="access" showSecrets={canAdminister}><header class="page-head"><h2>People and teams</h2><p>Organization membership and the access inherited by every repository.</p></header>{#if error || confirmation.error}<p class="error">{error || confirmation.error}</p>{/if}
  {#if isOwner && data.organization.kind !== 'personal'}<section><div class="settings-form"><label><span>Base repository role</span><Select bind:value={baseRole} options={repositoryRoles} ariaLabel="Base repository role" /></label><SettingsAction state={saveState} label="Save access" disabled={confirmation.busy} onclick={() => confirmation.request(saveSettings)} /></div></section>{/if}
  <section><header><div><h3>Members</h3><p>Organization roles govern teams, repositories, and invitations.</p></div>{#if canAdminister && data.organization.kind !== 'personal'}<Button onclick={() => { memberRole = 'member'; dialog = 'invite'; }}>Invite member</Button>{/if}</header><div class="list">{#each members as member}<article><UserAvatar name={member.displayName} src={member.avatarUrl} size={28} /><div><strong>{member.displayName}</strong><small>@{member.handle}{member.email ? ` · ${member.email}` : ''}</small></div>{#if member.role === 'owner' || !isOwner}<span class="role">{member.role}</span>{:else}<div class="role-select"><Select value={member.role} options={memberRoles} ariaLabel={`Role for ${member.handle}`} onchange={(value) => confirmation.request(() => changeMember(member, value))} /></div><Button variant="danger-soft" size="small" icon aria-label={`Remove ${member.handle}`} onclick={() => confirmation.request(() => removeMember(member))}><Trash2 size={14} /></Button>{/if}</article>{/each}</div></section>
  {#if invitations.length}<section><header><div><h3>Pending invitations</h3><p>Invitations expire automatically after seven days.</p></div></header><div class="list">{#each invitations as invitation}<article class="invitation"><div><strong>{invitation.email}</strong><small>{invitation.role}</small></div><Button variant="danger-soft" size="small" icon aria-label={`Revoke invitation for ${invitation.email}`} onclick={() => confirmation.request(() => revokeInvitation(invitation))}><Trash2 size={14} /></Button></article>{/each}</div></section>{/if}
  {#if data.organization.kind !== 'personal'}<section><header><div><h3>Teams</h3><p>Grant repository access once and keep membership centralized.</p></div>{#if canAdminister}<Button onclick={() => (dialog = 'team')}>New team</Button>{/if}</header><div class="teams">{#each teams as team}<article><div class="team-heading"><div><strong>{team.name}</strong><span>{team.slug} · {team.members} {team.members === 1 ? 'member' : 'members'}</span></div>{#if canAdminister}<div class="buttons"><Button size="small" onclick={() => { selectedTeam = team.id; selectedUser = userOptions[0]?.value ?? ''; dialog = 'team-member'; }}>Add member</Button><Button variant="danger-soft" size="small" icon aria-label={`Delete ${team.name}`} onclick={() => { selectedTeam = team.id; dialog = 'delete-team'; }}><Trash2 size={14} /></Button></div>{/if}</div><div class="team-members">{#each teamMembers.filter((member) => member.teamId === team.id) as member}<div><span>{member.displayName} <small>@{member.handle}</small></span>{#if canAdminister}<Button variant="ghost" size="small" icon aria-label={`Remove ${member.handle} from ${team.name}`} onclick={() => removeTeamMember(team, member)}><Trash2 size={13} /></Button>{/if}</div>{:else}<p>No members in this team.</p>{/each}</div></article>{:else}<p>No teams yet.</p>{/each}</div></section>{/if}
  </OrganizationSettingsShell>

{#snippet dialogActions()}<Button size="small" onclick={() => (dialog = null)}>Cancel</Button><Button size="small" variant={dialog === 'delete-team' ? 'danger' : 'primary'} disabled={Boolean(busy) || confirmation.busy} onclick={() => dialog === 'invite' ? invite() : dialog === 'team' ? createTeam() : dialog === 'delete-team' ? confirmation.request(deleteTeam) : addTeamMember()}>{dialog === 'invite' ? 'Send invitation' : dialog === 'team' ? 'Create team' : dialog === 'delete-team' ? 'Delete team' : 'Add member'}</Button>{/snippet}
<Modal open={dialog !== null} title={dialog === 'invite' ? 'Invite member' : dialog === 'team' ? 'New team' : dialog === 'delete-team' ? 'Delete team' : 'Add member to team'} onClose={() => (dialog = null)} actions={dialogActions}>{#if dialog === 'invite'}<div class="modal-form"><label><span>Email</span><input type="email" bind:value={inviteEmail} /></label><label><span>Role</span><Select bind:value={memberRole} options={memberRoles} ariaLabel="Organization role" /></label></div>{:else if dialog === 'team'}<div class="modal-form"><label><span>Name</span><input bind:value={teamName} oninput={() => { if (!teamSlug) teamSlug = teamName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }} /></label><label><span>URL name</span><input bind:value={teamSlug} /></label></div>{:else if dialog === 'delete-team'}<p>Delete this team and remove its repository grants? Members remain in the organization.</p>{:else}<div class="modal-form"><label><span>Team</span><Select bind:value={selectedTeam} options={teamOptions} ariaLabel="Team" /></label><label><span>Member</span><Select bind:value={selectedUser} options={userOptions} ariaLabel="Member" /></label></div>{/if}</Modal>
<IdentityConfirmationModal open={confirmation.open} method={confirmation.method} description="Confirm this organization access change before continuing." onClose={confirmation.close} onVerified={confirmation.continue} />

<style>
  .page-head{padding-bottom:24px;border-bottom:1px solid var(--border-subtle)}h2{margin:0;color:var(--text-strong);font-size:25px;letter-spacing:-.03em}.page-head p{margin:7px 0 0;color:var(--text-muted);font-size:13px;line-height:1.5}p{margin:6px 0 0;color:var(--text-muted);font-size:12px;line-height:1.5}section{padding:24px 0;border-bottom:1px solid var(--border-subtle)}section>header{display:flex;align-items:center;justify-content:space-between;gap:18px}h3{margin:0;color:var(--text-strong);font-size:13px}.settings-form{display:grid;grid-template-columns:minmax(0,230px) auto;align-items:end;gap:12px}.settings-form label,.modal-form label{display:grid;gap:7px}.settings-form label>span,.modal-form label>span{color:var(--text-strong);font-size:12px;font-weight:620}input{height:38px;padding:0 10px;border:1px solid var(--border-strong);border-radius:6px;outline:0;background:var(--surface);color:var(--text-strong);font-size:13px}.list{margin-top:13px}.list article{display:grid;grid-template-columns:32px minmax(0,1fr) 150px 32px;align-items:center;gap:10px;min-height:62px;border-top:1px solid var(--border-subtle)}.list strong,.list small{display:block}.list strong{color:var(--text-strong);font-size:13px}.list small{margin-top:3px;color:var(--text-faint);font-size:11px}.list .role{grid-column:3/5;justify-self:end;color:var(--text-muted);font-size:11px}.role-select{width:150px}.list article.invitation{grid-template-columns:1fr 34px}.buttons{display:flex;gap:7px}.teams{display:grid;gap:8px;margin-top:14px}.teams>article{padding:14px;border-radius:6px;background:var(--surface)}.team-heading{display:flex;align-items:center;justify-content:space-between;gap:12px}.teams strong,.teams span{display:block}.teams strong{color:var(--text-strong);font-size:13px}.teams span{margin-top:4px;color:var(--text-faint);font-size:11px}.team-members{display:grid;margin-top:11px;border-top:1px solid var(--border-subtle)}.team-members>div{display:flex;min-height:40px;align-items:center;justify-content:space-between}.team-members small{color:var(--text-faint)}.modal-form{display:grid;gap:15px}.error{display:flex;align-items:center;gap:7px;padding:10px;border-radius:6px;background:var(--danger-soft);color:var(--danger);font-size:12px}@media(max-width:760px){.settings-form{grid-template-columns:1fr}.teams{grid-template-columns:1fr}}
</style>
