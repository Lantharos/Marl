<script lang="ts">
  import { page } from '$app/state';
  import { untrack } from 'svelte';
  import Trash2 from '@lucide/svelte/icons/trash';
  import { api, MarlApiError } from '$lib/api';
  import Button from '$lib/components/controls/Button.svelte';
  import Field from '$lib/components/controls/Field.svelte';
  import Select from '$lib/components/controls/Select.svelte';
  import Notice from '$lib/components/feedback/Notice.svelte';
  import UserProfileLink from '$lib/components/identity/UserProfileLink.svelte';
  import ConfirmDialog from '$lib/components/overlays/ConfirmDialog.svelte';
  import Modal from '$lib/components/overlays/Modal.svelte';
  import CheckApprovalSettings from '$lib/components/settings/panels/CheckApprovalSettings.svelte';
  import SigningSettings from '$lib/components/settings/panels/SigningSettings.svelte';
  import SettingsHeader from '$lib/components/settings/SettingsHeader.svelte';
  import type { AccessPerson, AccessTeam } from './+page';
  import type { PageData } from './$types';

  type Kind = 'collaborators' | 'teams';

  const roles = ['read', 'triage', 'write', 'maintain', 'admin'].map((value) => ({
    value,
    label: value[0].toUpperCase() + value.slice(1)
  }));
  let { data }: { data: PageData } = $props();
  let collaborators = $state<AccessPerson[]>(untrack(() => data.collaborators));
  let teams = $state<AccessTeam[]>(untrack(() => data.teams));
  let adding = $state<Kind | null>(null);
  let removing = $state<{ kind: Kind; id: string; name: string } | null>(null);
  let selected = $state('');
  let role = $state('read');
  let busy = $state(false);
  let error = $state('');
  const base = $derived(`/repositories/${page.params.owner}/${page.params.repo}/access`);
  const settingsEndpoint = $derived(`/repositories/${page.params.owner}/${page.params.repo}/settings`);
  const peopleOptions = $derived(
    data.availableMembers
      .filter((person) => !collaborators.some((item) => item.id === person.id))
      .map((person) => ({ value: person.id, label: person.displayName, description: `@${person.handle}` }))
  );
  const teamOptions = $derived(
    data.availableTeams
      .filter((team) => !teams.some((item) => item.id === team.id))
      .map((team) => ({ value: team.id, label: team.name, description: team.slug }))
  );

  async function run(action: () => Promise<void>, fallback: string) {
    if (busy) return false;
    busy = true;
    error = '';
    try {
      await action();
      return true;
    } catch (cause) {
      error = cause instanceof MarlApiError ? cause.message : fallback;
      return false;
    } finally {
      busy = false;
    }
  }

  function grant(kind: Kind, id: string, nextRole: string) {
    return api<{ collaborator?: AccessPerson; team?: AccessTeam }>(`${base}/${kind}`, {
      method: 'PUT',
      body: JSON.stringify(kind === 'collaborators' ? { userId: id, role: nextRole } : { teamId: id, role: nextRole })
    });
  }

  function openAdd(kind: Kind) {
    selected = (kind === 'collaborators' ? peopleOptions : teamOptions)[0]?.value ?? '';
    role = 'read';
    error = '';
    adding = kind;
  }

  async function add() {
    const kind = adding;
    if (!kind || !selected) return;
    const saved = await run(async () => {
      await grant(kind, selected, role);
      if (kind === 'collaborators') {
        const person = data.availableMembers.find((item) => item.id === selected);
        if (person) collaborators = [...collaborators, { ...person, role }];
      } else {
        const team = data.availableTeams.find((item) => item.id === selected);
        if (team) teams = [...teams, { ...team, role, members: team.members ?? 0 }];
      }
    }, 'Access could not be granted.');
    if (saved) adding = null;
  }

  async function updateRole(kind: Kind, id: string, nextRole: string) {
    await run(async () => {
      await grant(kind, id, nextRole);
      if (kind === 'collaborators')
        collaborators = collaborators.map((item) => (item.id === id ? { ...item, role: nextRole } : item));
      else teams = teams.map((item) => (item.id === id ? { ...item, role: nextRole } : item));
    }, 'The role could not be changed.');
  }

  async function remove() {
    const target = removing;
    if (!target) return;
    const removed = await run(async () => {
      await api(`${base}/${target.kind}/${target.id}`, { method: 'DELETE' });
      if (target.kind === 'collaborators') collaborators = collaborators.filter((item) => item.id !== target.id);
      else teams = teams.filter((item) => item.id !== target.id);
    }, 'Access could not be removed.');
    if (removed) removing = null;
  }
</script>

<svelte:head><title>Access and security · {page.params.owner}/{page.params.repo} · Marl</title></svelte:head>
<SettingsHeader
  title="Access and security"
  description="Who can work in this repository, and what their pushes and pulls must satisfy."
/>
{#if error && !adding && !removing}<Notice class="mb-4">{error}</Notice>{/if}

<div class="grid gap-8">
  <section>
    <h2 class="mb-2.5 px-1 text-sm font-semibold text-ink-strong">Security</h2>
    {#key data.repository.id}<div class="divide-y divide-line-subtle surface px-4 sm:px-5">
        <SigningSettings endpoint={settingsEndpoint} initialMode={data.signingMode} />
        <CheckApprovalSettings endpoint={settingsEndpoint} initialValue={data.requireCheckApproval} />
      </div>{/key}
  </section>

  <section>
    <header class="mb-2.5 flex items-center justify-between gap-3 px-1">
      <h2 class="text-sm font-semibold text-ink-strong">Collaborators</h2>
      <Button size="small" disabled={!peopleOptions.length} onclick={() => openAdd('collaborators')}
        >Add collaborator</Button
      >
    </header>
    <div class="divide-y divide-line-subtle surface px-4 sm:px-5">
      {#each collaborators as person (person.id)}
        <article class="grid min-h-16 grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 py-3">
          <UserProfileLink
            handle={person.handle}
            displayName={person.displayName}
            avatarUrl={person.avatarUrl}
            size={30}
            showHandle
          />
          <div class="w-32">
            <Select
              value={person.role ?? 'read'}
              options={roles}
              ariaLabel={`Role for ${person.handle}`}
              onchange={(value) => updateRole('collaborators', person.id, value)}
            />
          </div>
          <Button
            variant="ghost"
            size="small"
            icon
            aria-label={`Remove ${person.handle}`}
            onclick={() => {
              error = '';
              removing = { kind: 'collaborators', id: person.id, name: person.displayName };
            }}><Trash2 size={15} /></Button
          >
        </article>
      {:else}
        <p class="py-6 text-center text-sm text-ink-muted">No direct collaborators.</p>
      {/each}
    </div>
  </section>

  <section>
    <header class="mb-2.5 flex items-center justify-between gap-3 px-1">
      <h2 class="text-sm font-semibold text-ink-strong">Teams</h2>
      <Button size="small" disabled={!teamOptions.length} onclick={() => openAdd('teams')}>Add team</Button>
    </header>
    <div class="divide-y divide-line-subtle surface px-4 sm:px-5">
      {#each teams as team (team.id)}
        <article class="grid min-h-16 grid-cols-[30px_minmax(0,1fr)_auto_auto] items-center gap-3 py-3">
          <span
            class="grid size-7.5 place-items-center rounded-lg bg-surface-muted text-xs font-semibold text-ink-muted"
            >{team.name.slice(0, 2).toUpperCase()}</span
          >
          <span class="min-w-0">
            <strong class="block truncate text-sm font-semibold text-ink-strong">{team.name}</strong>
            <span class="block text-xs text-ink-muted"
              >{team.members ?? 0} {team.members === 1 ? 'member' : 'members'}</span
            >
          </span>
          <div class="w-32">
            <Select
              value={team.role ?? 'read'}
              options={roles}
              ariaLabel={`Role for ${team.name}`}
              onchange={(value) => updateRole('teams', team.id, value)}
            />
          </div>
          <Button
            variant="ghost"
            size="small"
            icon
            aria-label={`Remove ${team.name}`}
            onclick={() => {
              error = '';
              removing = { kind: 'teams', id: team.id, name: team.name };
            }}><Trash2 size={15} /></Button
          >
        </article>
      {:else}
        <p class="py-6 text-center text-sm text-ink-muted">No teams have explicit access.</p>
      {/each}
    </div>
  </section>
</div>

<Modal
  open={adding !== null}
  size="small"
  title={adding === 'collaborators' ? 'Add collaborator' : 'Add team'}
  onClose={() => !busy && (adding = null)}
>
  <div class="grid gap-5">
    {#if adding === 'collaborators'}
      <Field label="Person"><Select bind:value={selected} options={peopleOptions} ariaLabel="Person" /></Field>
    {:else}
      <Field label="Team"><Select bind:value={selected} options={teamOptions} ariaLabel="Team" /></Field>
    {/if}
    <Field label="Role"><Select bind:value={role} options={roles} ariaLabel="Repository role" /></Field>
  </div>
  {#if error}<Notice class="mt-4">{error}</Notice>{/if}
  {#snippet actions()}
    <Button size="small" disabled={busy} onclick={() => (adding = null)}>Cancel</Button>
    <Button size="small" variant="primary" loading={busy} disabled={!selected} onclick={add}>Grant access</Button>
  {/snippet}
</Modal>

<ConfirmDialog
  open={removing !== null}
  title="Remove access?"
  confirmLabel="Remove access"
  {busy}
  {error}
  onConfirm={remove}
  onClose={() => (removing = null)}
>
  <strong>{removing?.name}</strong> will lose the access granted directly on this repository.
</ConfirmDialog>
