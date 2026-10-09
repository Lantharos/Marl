<script lang="ts">
  import type {
    OrganizationInvitation,
    OrganizationMember,
    OrganizationTeam,
    OrganizationTeamMember
  } from '@marl/contracts';
  import Trash2 from '@lucide/svelte/icons/trash';
  import Button from '#lib/components/controls/Button.svelte';
  import Field from '#lib/components/controls/Field.svelte';
  import Notice from '#lib/components/feedback/Notice.svelte';
  import ConfirmDialog from '#lib/components/overlays/ConfirmDialog.svelte';
  import Modal from '#lib/components/overlays/Modal.svelte';
  import SettingItem from '#lib/components/settings/SettingItem.svelte';
  import SettingsHeader from '#lib/components/settings/SettingsHeader.svelte';
  import SettingsGroup from '#lib/components/settings/SettingsGroup.svelte';
  import OrganizationSettingsShell from '#lib/components/settings/shells/OrganizationSettingsShell.svelte';
  import Select from '#lib/components/controls/Select.svelte';
  import SettingsAction from '#lib/components/settings/SettingsAction.svelte';
  import UserProfileLink from '#lib/components/identity/UserProfileLink.svelte';
  import { api, MarlApiError } from '#lib/api.js';
  import type { PageProps } from './$types';

  type Member = OrganizationMember;
  type Team = OrganizationTeam;
  type TeamMember = OrganizationTeamMember;
  type Invitation = OrganizationInvitation;
  let { data, params }: PageProps = $props();
  const {
    organization,
    members: savedMembers,
    teams: savedTeams,
    teamMembers: savedTeamMembers,
    invitations: savedInvitations
  } = $derived(data);
  let members = $derived(savedMembers);
  let teams = $derived(savedTeams);
  let teamMembers = $derived(savedTeamMembers);
  let invitations = $derived(savedInvitations);
  const savedBaseRole = $derived(organization.baseRepositoryRole ?? 'read');
  let baseRole = $derived(savedBaseRole);
  let removing = $state<Member | null>(null);
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
  const slug = $derived(params.slug);
  const canAdminister = $derived(data.viewerRole === 'owner' || data.viewerRole === 'admin');
  const isOwner = $derived(data.viewerRole === 'owner');
  const base = $derived(`/organizations/${slug}/access`);
  const memberRoles = [
    { value: 'member', label: 'Member' },
    { value: 'admin', label: 'Administrator' }
  ];
  const repositoryRoles = ['read', 'triage', 'write', 'maintain'].map((value) => ({
    value,
    label: value[0].toUpperCase() + value.slice(1)
  }));
  const teamOptions = $derived(
    teams.map((team) => ({ value: team.id, label: team.name, description: `${team.members} members` }))
  );
  const userOptions = $derived(
    members.map((member) => ({ value: member.id, label: member.displayName, description: `@${member.handle}` }))
  );

  async function run(key: string, action: () => Promise<void>) {
    busy = key;
    error = '';
    try {
      await action();
    } catch (cause) {
      error = cause instanceof MarlApiError ? cause.message : 'Organization access could not be updated.';
    } finally {
      busy = '';
    }
  }

  async function saveSettings() {
    saveState = 'saving';
    await run('settings', async () => {
      await api(`/organizations/${slug}`, { method: 'PATCH', body: JSON.stringify({ baseRepositoryRole: baseRole }) });
    });
    if (error) {
      saveState = 'idle';
      return;
    }
    saveState = 'saved';
    setTimeout(() => (saveState = 'idle'), 1800);
  }
  function invite() {
    return run('invite', async () => {
      const result = await api<{ invitation: Invitation }>(`${base}/invitations`, {
        method: 'POST',
        body: JSON.stringify({ email: inviteEmail, role: memberRole })
      });
      invitations = [result.invitation, ...invitations];
      dialog = null;
      inviteEmail = '';
    });
  }
  function createTeam() {
    return run('team', async () => {
      const result = await api<{ team: Team }>(`${base}/teams`, {
        method: 'POST',
        body: JSON.stringify({ name: teamName, slug: teamSlug })
      });
      teams = [...teams, result.team];
      dialog = null;
      teamName = '';
      teamSlug = '';
    });
  }
  function addTeamMember() {
    return run('team-member', async () => {
      await api(`${base}/teams/${selectedTeam}/members`, {
        method: 'POST',
        body: JSON.stringify({ userId: selectedUser })
      });
      const member = members.find((item) => item.id === selectedUser);
      if (member && !teamMembers.some((item) => item.teamId === selectedTeam && item.userId === selectedUser)) {
        teamMembers = [
          ...teamMembers,
          { teamId: selectedTeam, userId: member.id, handle: member.handle, displayName: member.displayName }
        ];
        teams = teams.map((team) => (team.id === selectedTeam ? { ...team, members: team.members + 1 } : team));
      }
      dialog = null;
    });
  }
  function removeTeamMember(team: Team, member: TeamMember) {
    return run(`team-member-${team.id}-${member.userId}`, async () => {
      await api(`${base}/teams/${team.id}/members/${member.userId}`, { method: 'DELETE' });
      teamMembers = teamMembers.filter((item) => item.teamId !== team.id || item.userId !== member.userId);
      teams = teams.map((item) => (item.id === team.id ? { ...item, members: Math.max(0, item.members - 1) } : item));
    });
  }
  function deleteTeam() {
    const teamId = selectedTeam;
    return run(`delete-team-${teamId}`, async () => {
      await api(`${base}/teams/${teamId}`, { method: 'DELETE' });
      teams = teams.filter((team) => team.id !== teamId);
      teamMembers = teamMembers.filter((member) => member.teamId !== teamId);
      dialog = null;
    });
  }
  async function changeMember(member: Member, role: string) {
    await run(`member-${member.id}`, async () => {
      await api(`${base}/members/${member.id}`, { method: 'PATCH', body: JSON.stringify({ role }) });
      members = members.map((item) => (item.id === member.id ? { ...item, role: role as 'admin' | 'member' } : item));
    });
  }
  async function removeMember(member: Member) {
    await run(`remove-${member.id}`, async () => {
      await api(`${base}/members/${member.id}`, { method: 'DELETE' });
      members = members.filter((item) => item.id !== member.id);
      removing = null;
    });
  }
  async function revokeInvitation(invitation: Invitation) {
    await api(`${base}/invitations/${invitation.id}`, { method: 'DELETE' });
    invitations = invitations.filter((item) => item.id !== invitation.id);
  }
</script>

<svelte:head><title>{organization.name} access · Marl</title></svelte:head>
<OrganizationSettingsShell
  name={organization.name}
  {slug}
  avatarUrl={organization.avatarUrl}
  active="access"
  showSecrets={canAdminister}
>
  <SettingsHeader title="People and teams" />
  {#if error}<Notice class="mb-4">{error}</Notice>{/if}
  <div class="grid gap-10">
    {#if isOwner && organization.kind !== 'personal'}
      <SettingsGroup label="Base repository role">
        <SettingItem
          title="Base repository role"
          description="The access every member has to this organization’s repositories."
        >
          <div class="w-40">
            <Select bind:value={baseRole} options={repositoryRoles} ariaLabel="Base repository role" />
          </div>
          <SettingsAction state={saveState} label="Save" onclick={saveSettings} />
        </SettingItem>
      </SettingsGroup>
    {/if}

    <SettingsGroup title="Members" description="Organization roles govern teams, repositories, and invitations.">
      {#snippet action()}{#if canAdminister && organization.kind !== 'personal'}<Button
            size="small"
            onclick={() => {
              memberRole = 'member';
              dialog = 'invite';
            }}>Invite member</Button
          >{/if}{/snippet}
      {#each members as member (member.id)}
        <article class="flex min-h-17 items-center gap-3 py-3">
          <span class="min-w-0 flex-1">
            <UserProfileLink
              handle={member.handle}
              displayName={member.displayName}
              avatarUrl={member.avatarUrl}
              size={30}
              detail={`@${member.handle}${member.email ? ` · ${member.email}` : ''}`}
            />
          </span>
          {#if member.role === 'owner' || !isOwner}<span
              class="rounded-full bg-surface-muted px-2.5 py-1 text-xs font-medium text-ink-muted capitalize"
              >{member.role}</span
            >{:else}
            <div class="w-40">
              <Select
                value={member.role}
                options={memberRoles}
                ariaLabel={`Role for ${member.handle}`}
                onchange={(value) => changeMember(member, value)}
              />
            </div>
            <Button
              variant="ghost"
              size="small"
              icon
              aria-label={`Remove ${member.handle}`}
              onclick={() => (removing = member)}><Trash2 size={15} /></Button
            >{/if}
        </article>
      {/each}
    </SettingsGroup>

    {#if invitations.length}
      <SettingsGroup title="Pending invitations" description="Invitations expire automatically after seven days.">
        {#each invitations as invitation (invitation.id)}
          <article class="flex min-h-15 items-center gap-3 py-3">
            <div class="min-w-0 flex-1">
              <strong class="block truncate text-sm font-semibold text-ink-strong">{invitation.email}</strong>
              <span class="text-xs text-ink-muted capitalize">{invitation.role}</span>
            </div>
            <Button variant="ghost" size="small" onclick={() => revokeInvitation(invitation)}>Revoke</Button>
          </article>
        {/each}
      </SettingsGroup>
    {/if}

    {#if organization.kind !== 'personal'}
      <SettingsGroup title="Teams" description="Grant repository access once and keep membership centralized.">
        {#snippet action()}{#if canAdminister}<Button size="small" onclick={() => (dialog = 'team')}>New team</Button
            >{/if}{/snippet}
        {#each teams as team (team.id)}
          <article class="py-4">
            <div class="flex flex-wrap items-center justify-between gap-3">
              <div class="min-w-0">
                <strong class="block truncate text-base font-semibold text-ink-strong">{team.name}</strong>
                <span class="text-xs text-ink-muted"
                  >{team.slug} · {team.members} {team.members === 1 ? 'member' : 'members'}</span
                >
              </div>
              {#if canAdminister}<div class="flex gap-1.5">
                  <Button
                    size="small"
                    onclick={() => {
                      selectedTeam = team.id;
                      selectedUser = userOptions[0]?.value ?? '';
                      dialog = 'team-member';
                    }}>Add member</Button
                  >
                  <Button
                    variant="ghost"
                    size="small"
                    icon
                    aria-label={`Delete ${team.name}`}
                    onclick={() => {
                      selectedTeam = team.id;
                      dialog = 'delete-team';
                    }}><Trash2 size={15} /></Button
                  >
                </div>{/if}
            </div>
            <div class="mt-3 grid gap-1">
              {#each teamMembers.filter((member) => member.teamId === team.id) as member (member.userId)}
                <div class="flex min-h-9 items-center justify-between gap-3 rounded-md bg-surface-muted px-3 text-sm">
                  <span class="truncate text-ink-strong"
                    >{member.displayName} <span class="text-ink-muted">@{member.handle}</span></span
                  >
                  {#if canAdminister}<Button
                      variant="ghost"
                      size="small"
                      icon
                      aria-label={`Remove ${member.handle} from ${team.name}`}
                      onclick={() => removeTeamMember(team, member)}><Trash2 size={14} /></Button
                    >{/if}
                </div>
              {:else}<p class="text-sm text-ink-muted">No members in this team.</p>{/each}
            </div>
          </article>
        {:else}<p class="py-6 text-sm text-ink-muted">No teams yet.</p>{/each}
      </SettingsGroup>
    {/if}
  </div>
</OrganizationSettingsShell>

{#snippet dialogActions()}
  <Button size="small" onclick={() => (dialog = null)}>Cancel</Button>
  <Button
    size="small"
    variant={dialog === 'delete-team' ? 'danger' : 'primary'}
    loading={Boolean(busy)}
    onclick={() =>
      dialog === 'invite'
        ? invite()
        : dialog === 'team'
          ? createTeam()
          : dialog === 'delete-team'
            ? deleteTeam()
            : addTeamMember()}
    >{dialog === 'invite'
      ? 'Send invitation'
      : dialog === 'team'
        ? 'Create team'
        : dialog === 'delete-team'
          ? 'Delete team'
          : 'Add member'}</Button
  >
{/snippet}
<Modal
  open={dialog !== null}
  title={dialog === 'invite'
    ? 'Invite member'
    : dialog === 'team'
      ? 'New team'
      : dialog === 'delete-team'
        ? 'Delete team?'
        : 'Add member to team'}
  size={dialog === 'delete-team' ? 'small' : 'medium'}
  onClose={() => (dialog = null)}
  actions={dialogActions}
>
  <div class="grid gap-5">
    {#if dialog === 'invite'}
      <Field label="Email"
        ><input class="field" type="email" bind:value={inviteEmail} placeholder="teammate@example.com" /></Field
      >
      <Field label="Role"><Select bind:value={memberRole} options={memberRoles} ariaLabel="Organization role" /></Field>
    {:else if dialog === 'team'}
      <Field label="Name">
        <input
          class="field"
          bind:value={teamName}
          oninput={() => {
            if (!teamSlug)
              teamSlug = teamName
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, '-')
                .replace(/^-|-$/g, '');
          }}
        />
      </Field>
      <Field label="URL name"><input class="field font-mono" bind:value={teamSlug} /></Field>
    {:else if dialog === 'delete-team'}
      <p class="text-sm leading-relaxed text-ink-muted">
        Its repository grants are removed. Members stay in the organization.
      </p>
    {:else}
      <Field label="Team"><Select bind:value={selectedTeam} options={teamOptions} ariaLabel="Team" /></Field>
      <Field label="Member"><Select bind:value={selectedUser} options={userOptions} ariaLabel="Member" /></Field>
    {/if}
    {#if error && dialog}<Notice>{error}</Notice>{/if}
  </div>
</Modal>

<ConfirmDialog
  open={removing !== null}
  title="Remove member?"
  confirmLabel="Remove member"
  busy={Boolean(busy)}
  onConfirm={() => removing && void removeMember(removing)}
  onClose={() => (removing = null)}
>
  <strong>{removing?.displayName}</strong> will lose access to this organization and its repositories.
</ConfirmDialog>
