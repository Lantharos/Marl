<script lang="ts">
  import { goto, invalidateAll } from '$app/navigation';
  import { page } from '$app/state';
  import { onDestroy, untrack } from 'svelte';
  import Check from '@lucide/svelte/icons/check';
  import { api, MarlApiError } from '$lib/api';
  import Button from '$lib/components/controls/Button.svelte';
  import Field from '$lib/components/controls/Field.svelte';
  import ImageUploadButton from '$lib/components/controls/ImageUploadButton.svelte';
  import Select from '$lib/components/controls/Select.svelte';
  import Notice from '$lib/components/feedback/Notice.svelte';
  import RepositoryIcon from '$lib/components/identity/RepositoryIcon.svelte';
  import ConfirmDialog from '$lib/components/overlays/ConfirmDialog.svelte';
  import Modal from '$lib/components/overlays/Modal.svelte';
  import SettingItem from '$lib/components/settings/SettingItem.svelte';
  import SettingRow from '$lib/components/settings/SettingRow.svelte';
  import SettingsHeader from '$lib/components/settings/SettingsHeader.svelte';
  import { completeRepositoryName, repositoryName, validRepositoryName } from '$lib/repositories/repository-name';
  import type { PageData } from './$types';

  type Dialog = 'branch' | 'visibility' | 'rename' | 'transfer' | 'detach' | 'archive' | 'delete';

  let { data }: { data: PageData } = $props();
  const owner = $derived(page.params.owner ?? '');
  const repo = $derived(page.params.repo ?? '');
  const endpoint = $derived(`/repositories/${owner}/${repo}/settings`);
  let description = $state(untrack(() => data.repository.description));
  let savedDescription = $state(untrack(() => data.repository.description));
  let iconUrl = $state<string | null>(untrack(() => data.repository.iconUrl));
  let iconState = $state<'idle' | 'saving' | 'saved'>('idle');
  let iconInput = $state<HTMLInputElement>();
  let visibility = $state(untrack(() => data.repository.visibility));
  let defaultBranch = $state(untrack(() => data.repository.defaultBranch ?? 'main'));
  let nextDefaultBranch = $state('');
  let newName = $state('');
  let destination = $state('');
  let deleteConfirmation = $state('');
  let archived = $state(untrack(() => Boolean(data.repository.archivedAt)));
  let upstream = $state(untrack(() => data.repository.upstream));
  let dialog = $state<Dialog | null>(null);
  let busy = $state<Dialog | 'description' | null>(null);
  let descriptionSaved = $state(false);
  let error = $state('');
  let savedTimer: ReturnType<typeof setTimeout> | undefined;
  const nextVisibility = $derived(visibility === 'public' ? 'private' : 'public');
  const ownerOptions = $derived(
    data.organizations.map((organization) => ({
      value: organization.slug,
      label: organization.slug,
      description: organization.name
    }))
  );
  const branchOptions = $derived(data.branches.map((branch) => ({ value: branch.name, label: branch.name })));
  const submittedNewName = $derived(completeRepositoryName(newName));

  function open(next: Dialog) {
    error = '';
    nextDefaultBranch = defaultBranch;
    newName = repositoryName(repo);
    destination = data.organizations.find((organization) => organization.slug !== owner)?.slug ?? owner;
    deleteConfirmation = '';
    dialog = next;
  }

  async function run(name: Dialog | 'description', action: () => Promise<void>) {
    if (busy) return false;
    busy = name;
    error = '';
    try {
      await action();
      return true;
    } catch (cause) {
      error = cause instanceof MarlApiError ? cause.message : 'Repository settings could not be updated.';
      return false;
    } finally {
      busy = null;
    }
  }

  async function patch(body: Record<string, unknown>) {
    await api(endpoint, { method: 'PATCH', body: JSON.stringify(body) });
  }

  async function saveDescription() {
    if (description === savedDescription) return;
    const submitted = description;
    if (!(await run('description', () => patch({ description: submitted })))) return;
    savedDescription = submitted;
    descriptionSaved = true;
    clearTimeout(savedTimer);
    savedTimer = setTimeout(() => (descriptionSaved = false), 1800);
  }

  async function uploadIcon(event: Event & { currentTarget: HTMLInputElement }) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    input.value = '';
    if (!file || iconState === 'saving') return;
    iconState = 'saving';
    error = '';
    try {
      const result = await api<{ iconUrl: string }>(`/repositories/${owner}/${repo}/icon`, {
        method: 'PUT',
        headers: { 'content-type': file.type },
        body: file
      });
      iconUrl = result.iconUrl;
      iconState = 'saved';
      await invalidateAll();
      setTimeout(() => (iconState = 'idle'), 1800);
    } catch (cause) {
      error = cause instanceof MarlApiError ? cause.message : 'Repository icon could not be updated.';
      iconState = 'idle';
    }
  }

  const actions: Record<Dialog, () => Promise<void>> = {
    branch: async () => {
      await patch({ defaultBranch: nextDefaultBranch });
      defaultBranch = nextDefaultBranch;
    },
    visibility: async () => {
      await patch({ visibility: nextVisibility });
      visibility = nextVisibility;
    },
    archive: async () => {
      await patch({ archived: !archived });
      archived = !archived;
    },
    detach: async () => {
      await api(`${endpoint}/detach-fork`, { method: 'POST' });
      upstream = null;
    },
    rename: () => move('rename', { name: submittedNewName }),
    transfer: () => move('transfer', { owner: destination }),
    delete: async () => {
      await api(`${endpoint}/delete`, { method: 'POST', body: JSON.stringify({ confirmation: deleteConfirmation }) });
      await goto('/repositories');
    }
  };

  async function move(kind: 'rename' | 'transfer', body: Record<string, string>) {
    const result = await api<{ repository: { owner: string; name: string } }>(`${endpoint}/${kind}`, {
      method: 'POST',
      body: JSON.stringify(body)
    });
    await goto(`/${result.repository.owner}/${result.repository.name}/settings`, { replaceState: true });
  }

  async function confirm() {
    if (dialog && (await run(dialog, actions[dialog]))) dialog = null;
  }

  onDestroy(() => clearTimeout(savedTimer));
</script>

<svelte:head><title>Settings · {owner}/{repo} · Marl</title></svelte:head>
<SettingsHeader title="General" description="How this repository appears and who owns it." />
{#if error && !dialog}<Notice class="mb-4">{error}</Notice>{/if}

<div class="grid gap-8">
  <section class="grid gap-6 surface p-5 sm:p-6">
    <div class="flex items-center gap-4">
      <ImageUploadButton state={iconState} label="Change repository icon" size={56} onclick={() => iconInput?.click()}
        ><RepositoryIcon name={repo} src={iconUrl} size={56} /></ImageUploadButton
      >
      <div>
        <strong class="block text-base font-semibold text-ink-strong">Repository icon</strong>
        <p class="mt-1 text-sm text-ink-muted">PNG, JPEG, or WebP up to 2 MB</p>
        <input
          bind:this={iconInput}
          class="hidden"
          type="file"
          accept="image/png,image/jpeg,image/webp"
          onchange={uploadIcon}
        />
      </div>
    </div>
    <form
      class="grid gap-3"
      onsubmit={(event) => {
        event.preventDefault();
        void saveDescription();
      }}
    >
      <Field label="Description" hint={`${description.length}/280`}>
        <input
          class="field"
          bind:value={description}
          maxlength="280"
          placeholder="Describe this repository"
          data-1p-ignore
        />
      </Field>
      <div class="flex justify-end">
        <Button
          type="submit"
          size="small"
          variant="primary"
          loading={busy === 'description'}
          disabled={description === savedDescription}
          >{#if descriptionSaved && description === savedDescription}<Check size={14} />Saved{:else}Save description{/if}</Button
        >
      </div>
    </form>
  </section>

  <section>
    <h2 class="mb-2.5 px-1 text-sm font-semibold text-ink-strong">Code and visibility</h2>
    <div class="divide-y divide-line-subtle surface px-4 sm:px-5">
      <SettingRow
        title="Default branch"
        value={defaultBranch}
        disabled={!branchOptions.length}
        onclick={() => open('branch')}
      />
      <SettingRow
        title="Visibility"
        value={visibility === 'public'
          ? 'Public. Anyone can view and clone this repository.'
          : 'Private. Only people with access can view and clone it.'}
        action={visibility === 'public' ? 'Make private' : 'Make public'}
        onclick={() => open('visibility')}
      />
    </div>
  </section>

  <section>
    <h2 class="mb-2.5 px-1 text-sm font-semibold text-ink-strong">Ownership</h2>
    <div class="divide-y divide-line-subtle surface px-4 sm:px-5">
      <SettingRow title="Name" value={`${owner}/${repo}`} action="Rename" onclick={() => open('rename')} />
      <SettingRow
        title="Owner"
        value="Move this repository and its full history to another organization."
        action="Transfer"
        disabled={ownerOptions.length < 2}
        onclick={() => open('transfer')}
      />
    </div>
  </section>

  <section>
    <h2 class="mb-2.5 px-1 text-sm font-semibold text-ink-strong">Lifecycle</h2>
    <div class="divide-y divide-line-subtle surface px-4 sm:px-5">
      {#if upstream}<SettingRow
          title="Fork"
          value={`Forked from ${upstream.owner}/${upstream.name}. Detaching keeps this repository and its history.`}
          action="Detach"
          onclick={() => open('detach')}
        />{/if}
      <SettingRow
        title={archived ? 'Archived' : 'Archive'}
        value={archived
          ? 'Pushes are rejected. Unarchive to restore normal activity.'
          : 'Make the repository read-only while preserving every object.'}
        action={archived ? 'Unarchive' : 'Archive'}
        onclick={() => open('archive')}
      />
      <SettingItem title="Delete repository" description="Hidden immediately and permanently purged after 30 days.">
        <Button size="small" variant="danger-soft" onclick={() => open('delete')}>Delete</Button>
      </SettingItem>
    </div>
  </section>
</div>

<Modal open={dialog === 'branch'} size="small" title="Change default branch" onClose={() => !busy && (dialog = null)}>
  <Field label="Default branch"
    ><Select bind:value={nextDefaultBranch} ariaLabel="Default branch" options={branchOptions} /></Field
  >
  {#if error}<Notice class="mt-4">{error}</Notice>{/if}
  {#snippet actions()}
    <Button size="small" disabled={Boolean(busy)} onclick={() => (dialog = null)}>Cancel</Button>
    <Button
      size="small"
      variant="primary"
      loading={busy === 'branch'}
      disabled={nextDefaultBranch === defaultBranch}
      onclick={confirm}>Change branch</Button
    >
  {/snippet}
</Modal>

<Modal
  open={dialog === 'rename'}
  size="small"
  title="Rename repository"
  description="Links and clone URLs change immediately."
  onClose={() => !busy && (dialog = null)}
>
  <form
    id="rename-form"
    onsubmit={(event) => {
      event.preventDefault();
      void confirm();
    }}
  >
    <Field label="New name">
      <input
        class="field"
        bind:value={newName}
        oninput={() => (newName = repositoryName(newName))}
        onblur={() => (newName = submittedNewName)}
        maxlength="100"
        autocomplete="off"
        data-1p-ignore
      />
    </Field>
  </form>
  {#if error}<Notice class="mt-4">{error}</Notice>{/if}
  {#snippet actions()}
    <Button size="small" disabled={Boolean(busy)} onclick={() => (dialog = null)}>Cancel</Button>
    <Button
      size="small"
      variant="primary"
      type="submit"
      form="rename-form"
      loading={busy === 'rename'}
      disabled={submittedNewName === repo || !validRepositoryName(submittedNewName)}>Rename</Button
    >
  {/snippet}
</Modal>

<Modal
  open={dialog === 'transfer'}
  size="small"
  title="Transfer ownership"
  description="The repository, pulls, settings, and Git storage move together."
  onClose={() => !busy && (dialog = null)}
>
  <Field label="Destination organization"
    ><Select bind:value={destination} ariaLabel="Destination organization" options={ownerOptions} /></Field
  >
  {#if error}<Notice class="mt-4">{error}</Notice>{/if}
  {#snippet actions()}
    <Button size="small" disabled={Boolean(busy)} onclick={() => (dialog = null)}>Cancel</Button>
    <Button
      size="small"
      variant="primary"
      loading={busy === 'transfer'}
      disabled={destination === owner}
      onclick={confirm}>Transfer repository</Button
    >
  {/snippet}
</Modal>

<Modal
  open={dialog === 'delete'}
  size="small"
  title="Delete repository?"
  description="The repository is hidden immediately and permanently deleted after 30 days."
  onClose={() => !busy && (dialog = null)}
>
  <Field label={`Type ${owner}/${repo} to confirm`}>
    <input
      class="field font-mono"
      bind:value={deleteConfirmation}
      autocomplete="off"
      placeholder="{owner}/{repo}"
      data-1p-ignore
    />
  </Field>
  {#if error}<Notice class="mt-4">{error}</Notice>{/if}
  {#snippet actions()}
    <Button size="small" disabled={Boolean(busy)} onclick={() => (dialog = null)}>Cancel</Button>
    <Button
      size="small"
      variant="danger"
      loading={busy === 'delete'}
      disabled={deleteConfirmation !== `${owner}/${repo}`}
      onclick={confirm}>Delete repository</Button
    >
  {/snippet}
</Modal>

<ConfirmDialog
  open={dialog === 'visibility'}
  title={`Make ${owner}/${repo} ${nextVisibility}?`}
  confirmLabel={`Make ${nextVisibility}`}
  tone={nextVisibility === 'public' ? 'danger' : 'primary'}
  busy={busy === 'visibility'}
  {error}
  onConfirm={confirm}
  onClose={() => (dialog = null)}
>
  {nextVisibility === 'public'
    ? 'Anyone will be able to view and clone its code, and it will appear on public profiles and in search.'
    : 'Only people with access will be able to view and clone it. Public profile activity from it will be hidden.'}
</ConfirmDialog>

<ConfirmDialog
  open={dialog === 'archive'}
  title={archived ? 'Unarchive repository?' : 'Archive repository?'}
  confirmLabel={archived ? 'Unarchive' : 'Archive'}
  tone="primary"
  busy={busy === 'archive'}
  {error}
  onConfirm={confirm}
  onClose={() => (dialog = null)}
>
  {archived
    ? 'Pushes and normal repository activity will be restored.'
    : 'Existing code stays available, but every Git push will be rejected. You can reverse this at any time.'}
</ConfirmDialog>

<ConfirmDialog
  open={dialog === 'detach'}
  title="Detach this fork?"
  confirmLabel="Detach fork"
  busy={busy === 'detach'}
  {error}
  onConfirm={confirm}
  onClose={() => (dialog = null)}
>
  This repository becomes the root of an independent fork network. Code, branches, stars, and history are preserved.
</ConfirmDialog>
