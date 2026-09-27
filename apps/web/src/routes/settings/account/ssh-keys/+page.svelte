<script lang="ts">
  import { untrack } from 'svelte';
  import type { SshKey } from '@marl/contracts';
  import KeyRound from '@lucide/svelte/icons/key-round';
  import Trash2 from '@lucide/svelte/icons/trash';
  import { api, MarlApiError } from '$lib/api';
  import Button from '$lib/components/controls/Button.svelte';
  import Modal from '$lib/components/overlays/Modal.svelte';
  import Field from '$lib/components/controls/Field.svelte';
  import EmptyState from '$lib/components/feedback/EmptyState.svelte';
  import Notice from '$lib/components/feedback/Notice.svelte';
  import ConfirmDialog from '$lib/components/overlays/ConfirmDialog.svelte';
  import SettingsHeader from '$lib/components/settings/SettingsHeader.svelte';
  import Time from '$lib/components/page/Time.svelte';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
  let sshKeys = $state<SshKey[]>(untrack(() => data.sshKeys));
  let name = $state('');
  let publicKey = $state('');
  let busy = $state(false);
  let open = $state(false);
  let error = $state('');
  let removing = $state<SshKey | null>(null);

  async function addKey() {
    if (busy || !name.trim() || !publicKey.trim()) return;
    busy = true;
    error = '';
    try {
      const result = await api<{ sshKey: SshKey }>('/ssh-keys', {
        method: 'POST',
        body: JSON.stringify({ name: name.trim(), publicKey: publicKey.trim() })
      });
      sshKeys = [result.sshKey, ...sshKeys];
      name = '';
      publicKey = '';
      open = false;
    } catch (cause) {
      error = cause instanceof MarlApiError ? cause.message : 'The SSH key could not be added.';
    } finally {
      busy = false;
    }
  }

  async function removeKey(key: SshKey) {
    if (busy) return;
    busy = true;
    error = '';
    try {
      await api(`/ssh-keys/${key.id}`, { method: 'DELETE' });
      sshKeys = sshKeys.filter((item) => item.id !== key.id);
      removing = null;
    } catch (cause) {
      error = cause instanceof MarlApiError ? cause.message : 'The SSH key could not be removed.';
    } finally {
      busy = false;
    }
  }
</script>

<svelte:head><title>SSH keys · Marl</title></svelte:head>
<SettingsHeader title="SSH keys" description="Push and pull over SSH, and sign commits with a key Marl can verify.">
  {#snippet action()}<Button
      size="small"
      onclick={() => {
        error = '';
        open = true;
      }}>Add SSH key</Button
    >{/snippet}
</SettingsHeader>
{#if error && !open && !removing}<Notice class="mb-4">{error}</Notice>{/if}
<div class="divide-y divide-line-subtle surface px-4 sm:px-5">
  {#each sshKeys as key (key.id)}
    <article class="grid min-h-20 grid-cols-[24px_minmax(0,1fr)_auto] items-center gap-3 py-3">
      <KeyRound size={18} class="text-ink-muted" />
      <div class="min-w-0">
        <strong class="block truncate text-base font-semibold text-ink-strong">{key.name}</strong>
        <code class="mt-0.5 block truncate font-mono text-xs text-ink-muted">{key.fingerprint}</code>
        <span class="mt-0.5 block text-xs text-ink-faint"
          >Added <Time value={key.createdAt} class="text-ink-faint" />{#if key.lastUsedAt}
            · last used <Time value={key.lastUsedAt} class="text-ink-faint" />{:else}
            · never used{/if}</span
        >
      </div>
      <Button
        variant="ghost"
        size="small"
        icon
        aria-label={`Remove ${key.name}`}
        onclick={() => {
          error = '';
          removing = key;
        }}><Trash2 size={15} /></Button
      >
    </article>
  {:else}
    <EmptyState
      compact
      icon={KeyRound}
      title="No SSH keys"
      description="Add a public key to use the SSH clone URL shown on repositories."
    />
  {/each}
</div>

<Modal {open} title="Add SSH key" onClose={() => !busy && (open = false)}>
  <form
    id="ssh-key-form"
    class="grid gap-5"
    onsubmit={(event) => {
      event.preventDefault();
      void addKey();
    }}
  >
    <Field label="Name"
      ><input class="field" bind:value={name} placeholder="Work laptop" autocomplete="off" data-1p-ignore /></Field
    >
    <Field label="Public key" hint="Paste the contents of a .pub file, such as ~/.ssh/id_ed25519.pub.">
      <textarea
        class="field min-h-24 resize-y py-3 font-mono text-xs leading-relaxed"
        bind:value={publicKey}
        placeholder="ssh-ed25519 AAAA…"
        rows="3"
        data-1p-ignore></textarea>
    </Field>
  </form>
  {#if error}<Notice class="mt-4">{error}</Notice>{/if}
  {#snippet actions()}
    <Button size="small" disabled={busy} onclick={() => (open = false)}>Cancel</Button>
    <Button
      size="small"
      type="submit"
      form="ssh-key-form"
      variant="primary"
      loading={busy}
      disabled={!name.trim() || !publicKey.trim()}>Add key</Button
    >
  {/snippet}
</Modal>

<ConfirmDialog
  open={removing !== null}
  title="Remove SSH key?"
  confirmLabel="Remove key"
  {busy}
  {error}
  onConfirm={() => removing && void removeKey(removing)}
  onClose={() => (removing = null)}
>
  Machines using <strong>{removing?.name}</strong> will no longer be able to push or pull over SSH.
</ConfirmDialog>
