<script lang="ts">
  import { untrack } from 'svelte';
  import KeyRound from '@lucide/svelte/icons/key-round';
  import Trash2 from '@lucide/svelte/icons/trash';
  import { api, MarlApiError } from '$lib/api';
  import Button from '../../controls/Button.svelte';
  import Field from '../../controls/Field.svelte';
  import EmptyState from '../../feedback/EmptyState.svelte';
  import Notice from '../../feedback/Notice.svelte';
  import ConfirmDialog from '../../overlays/ConfirmDialog.svelte';
  import Modal from '../../overlays/Modal.svelte';
  import Time from '../../page/Time.svelte';
  import SettingsHeader from '../SettingsHeader.svelte';

  type Secret = { id: string; name: string; createdAt: string; updatedAt: string };
  let {
    initialSecrets,
    endpoint,
    scope
  }: { initialSecrets: Secret[]; endpoint: string; scope: 'repository' | 'organization' } = $props();
  let secrets = $state<Secret[]>(untrack(() => initialSecrets));
  let name = $state('');
  let value = $state('');
  let busy = $state(false);
  let open = $state(false);
  let editing = $state(false);
  let removing = $state<Secret | null>(null);
  let error = $state('');

  function openEditor(secret?: Secret) {
    name = secret?.name ?? '';
    value = '';
    editing = Boolean(secret);
    error = '';
    open = true;
  }

  async function save() {
    if (busy || !name || !value) return;
    busy = true;
    error = '';
    const normalized = name.trim().toUpperCase();
    if (!editing && secrets.some((secret) => secret.name === normalized)) {
      error = 'This secret already exists. Use Change to replace its value.';
      busy = false;
      return;
    }
    try {
      await api(`${endpoint}/${encodeURIComponent(normalized)}`, { method: 'PUT', body: JSON.stringify({ value }) });
      const now = new Date().toISOString();
      const existing = secrets.find((secret) => secret.name === normalized);
      secrets = existing
        ? secrets.map((secret) => (secret.name === normalized ? { ...secret, updatedAt: now } : secret))
        : [...secrets, { id: normalized, name: normalized, createdAt: now, updatedAt: now }].sort((a, b) =>
            a.name.localeCompare(b.name)
          );
      name = '';
      value = '';
      open = false;
    } catch (cause) {
      error = cause instanceof MarlApiError ? cause.message : 'The secret could not be saved.';
    } finally {
      busy = false;
    }
  }

  async function remove(secret: Secret) {
    if (busy) return;
    busy = true;
    error = '';
    try {
      await api(`${endpoint}/${encodeURIComponent(secret.name)}`, { method: 'DELETE' });
      secrets = secrets.filter((item) => item.name !== secret.name);
      removing = null;
    } catch (cause) {
      error = cause instanceof MarlApiError ? cause.message : 'The secret could not be removed.';
    } finally {
      busy = false;
    }
  }
</script>

<SettingsHeader
  title="CI secrets"
  description={scope === 'organization'
    ? 'Shared with organization repositories. A repository secret with the same name takes precedence.'
    : 'Repository secrets override organization secrets with the same name.'}
>
  {#snippet action()}<Button size="small" onclick={() => openEditor()}>Add secret</Button>{/snippet}
</SettingsHeader>

<section class="divide-y divide-line-subtle surface px-4 sm:px-5" aria-label="CI secrets">
  {#each secrets as secret (secret.id)}
    <article
      class="grid min-h-19 grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2 sm:grid-cols-[24px_minmax(0,1fr)_auto_auto] sm:gap-3"
    >
      <KeyRound size={17} class="hidden text-ink-muted sm:block" />
      <span class="min-w-0">
        <strong class="block font-mono text-sm font-semibold break-all text-ink-strong">{secret.name}</strong>
        <span class="mt-1 block text-xs text-ink-muted"
          >Updated <Time value={secret.updatedAt} class="text-ink-muted" /></span
        >
      </span>
      <Button size="small" aria-label="Change {secret.name}" aria-haspopup="dialog" onclick={() => openEditor(secret)}
        >Change</Button
      >
      <Button
        variant="ghost"
        size="small"
        icon
        aria-label="Delete {secret.name}"
        onclick={() => {
          error = '';
          removing = secret;
        }}><Trash2 size={15} /></Button
      >
    </article>
  {:else}
    <EmptyState
      icon={KeyRound}
      compact
      title="No {scope} secrets"
      description="Secrets are passed to workflow jobs as environment variables and masked in logs."
    />
  {/each}
</section>

<Modal
  {open}
  title={editing ? 'Change secret' : 'Add secret'}
  description="Encrypted and masked from runner logs. Saved values cannot be read back."
  onClose={() => {
    if (!busy) {
      open = false;
      value = '';
    }
  }}
>
  <form
    id="secret-form"
    class="grid gap-5"
    onsubmit={(event) => {
      event.preventDefault();
      void save();
    }}
  >
    <Field label="Name">
      <input
        class="field font-mono"
        bind:value={name}
        disabled={editing || busy}
        oninput={() => (name = name.toUpperCase().replace(/[^A-Z0-9_]/g, ''))}
        placeholder="DEPLOY_TOKEN"
        autocomplete="off"
        required
      />
    </Field>
    <Field label={editing ? 'New value' : 'Value'}>
      <input
        class="field"
        bind:value
        disabled={busy}
        type="password"
        placeholder="Secret value"
        autocomplete="new-password"
        required
      />
    </Field>
  </form>
  {#if error}<Notice class="mt-4">{error}</Notice>{/if}
  {#snippet actions()}
    <Button
      size="small"
      disabled={busy}
      onclick={() => {
        open = false;
        value = '';
      }}>Cancel</Button
    >
    <Button type="submit" form="secret-form" variant="primary" size="small" loading={busy} disabled={!name || !value}
      >Save</Button
    >
  {/snippet}
</Modal>

<ConfirmDialog
  open={removing !== null}
  title="Delete secret?"
  confirmLabel="Delete secret"
  {busy}
  {error}
  onConfirm={() => removing && void remove(removing)}
  onClose={() => (removing = null)}
>
  <strong class="font-mono">{removing?.name}</strong> will no longer be available to new jobs.
</ConfirmDialog>
