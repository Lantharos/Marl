<script lang="ts">
  import { untrack } from 'svelte';
  import KeyRound from 'lucide-svelte/icons/key-round';
  import Trash2 from 'lucide-svelte/icons/trash-2';
  import { api, MarlApiError } from '$lib/api';
  import IdentityConfirmationModal from '$lib/components/IdentityConfirmationModal.svelte';
  import Time from '$lib/components/Time.svelte';
  import type { PageData } from './$types';

  type SshKey = { id: string; name: string; fingerprint: string; lastUsedAt: string | null; createdAt: string };
  let { data } = $props<{ data: PageData }>();
  let sshKeys = $state<SshKey[]>(untrack(() => data.sshKeys));
  let name = $state('');
  let publicKey = $state('');
  let busy = $state(false);
  let error = $state('');
  let confirmationOpen = $state(false);
  let confirmationMethod = $state<'passkey' | 'totp' | 'password' | null>(null);
  let pendingAction = $state<(() => Promise<void>) | null>(null);

  async function confirm(action: () => Promise<void>) {
    if (busy) return;
    busy = true;
    error = '';
    try {
      const response = await fetch('/api/auth/step-up/method', { headers: { accept: 'application/json' } });
      const result = await response.json().catch(() => null) as { method?: 'passkey' | 'totp' | 'password'; message?: string } | null;
      if (!response.ok || !result?.method) throw new Error(result?.message || 'Identity confirmation is not available.');
      confirmationMethod = result.method;
      pendingAction = action;
      confirmationOpen = true;
    } catch (cause) {
      error = cause instanceof Error ? cause.message : 'Identity confirmation is not available.';
    } finally {
      busy = false;
    }
  }

  async function addKey() {
    if (busy || !name.trim() || !publicKey.trim()) return;
    busy = true;
    error = '';
    try {
      const result = await api<{ sshKey: SshKey }>('/ssh-keys', { method: 'POST', body: JSON.stringify({ name: name.trim(), publicKey: publicKey.trim() }) });
      sshKeys = [result.sshKey, ...sshKeys];
      name = '';
      publicKey = '';
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
    } catch (cause) {
      error = cause instanceof MarlApiError ? cause.message : 'The SSH key could not be removed.';
    } finally {
      busy = false;
    }
  }

  async function continuePendingAction() {
    const action = pendingAction;
    pendingAction = null;
    confirmationMethod = null;
    if (action) await action();
  }
</script>

<svelte:head><title>SSH keys · Marl</title></svelte:head>
<header class="page-head"><h2>SSH keys</h2><p>Use public keys to clone, push, and verify commits signed with your Marl identity.</p></header>
<form onsubmit={(event) => { event.preventDefault(); void confirm(addKey); }}>
  <label><span>Name</span><input bind:value={name} placeholder="Work laptop" autocomplete="off" /></label>
  <label><span>Public key</span><textarea bind:value={publicKey} placeholder="ssh-ed25519 AAAA…" rows="3"></textarea></label>
  <button class="primary" disabled={busy || !name.trim() || !publicKey.trim()}>{busy ? 'Adding…' : 'Add SSH key'}</button>
</form>
{#if error}<p class="error" role="alert">{error}</p>{/if}
<div class="key-list">
  {#each sshKeys as key}
    <article><span class="key-icon"><KeyRound size={17} /></span><div><strong>{key.name}</strong><code>{key.fingerprint}</code><small>Added <Time value={key.createdAt} />{#if key.lastUsedAt} · last used <Time value={key.lastUsedAt} />{:else} · never used{/if}</small></div><button aria-label={`Remove ${key.name}`} onclick={() => confirm(() => removeKey(key))}><Trash2 size={15} /></button></article>
  {:else}<div class="empty"><KeyRound size={24} /><strong>No SSH keys</strong><p>Add a public key to use the SSH clone URL shown on repositories.</p></div>{/each}
</div>
<IdentityConfirmationModal open={confirmationOpen} method={confirmationMethod} onClose={() => { confirmationOpen = false; pendingAction = null; confirmationMethod = null; }} onVerified={continuePendingAction} />

<style>
  .page-head{padding-bottom:24px;border-bottom:1px solid var(--border-subtle)}h2{margin:0;color:var(--text-strong);font-size:25px;letter-spacing:-.03em}.page-head p{margin:7px 0 0;color:var(--text-muted);font-size:13px;line-height:1.5}form{display:grid;gap:15px;padding:24px 0;border-bottom:1px solid var(--border-subtle)}label{display:grid;gap:7px}label span{color:var(--text-strong);font-size:12px;font-weight:630}input,textarea{box-sizing:border-box;width:100%;padding:9px 10px;border:1px solid var(--border-strong);border-radius:6px;outline:0;background:var(--surface);color:var(--text-strong);font:inherit;font-size:13px}input{height:38px}textarea{min-height:78px;resize:vertical;font-family:var(--font-mono)}input:focus,textarea:focus{border-color:var(--brand)}button{display:inline-flex;height:36px;align-items:center;justify-content:center;padding:0 12px;border:1px solid var(--border);border-radius:6px;background:var(--surface);color:var(--text);cursor:pointer;font-size:12px;font-weight:630}button.primary{justify-self:start;border-color:var(--brand);background:var(--brand);color:white}button:disabled{opacity:.5}.error{padding:10px;border-radius:6px;background:var(--danger-soft);color:var(--danger);font-size:12px}.key-list article{display:grid;grid-template-columns:38px minmax(0,1fr) 38px;align-items:center;gap:11px;min-height:78px;border-bottom:1px solid var(--border-subtle)}.key-icon{display:grid;width:34px;height:34px;color:var(--text-muted);place-items:center}.key-list strong,.key-list code,.key-list small{display:block}.key-list strong{color:var(--text-strong);font-size:13px}.key-list code{overflow:hidden;margin-top:4px;color:var(--text);font-size:11px;text-overflow:ellipsis;white-space:nowrap}.key-list small{margin-top:4px;color:var(--text-muted);font-size:11px}.key-list article>button{width:34px;padding:0;border-color:transparent;background:transparent;color:var(--danger)}.empty{padding:52px 0;color:var(--text-muted);text-align:center}.empty strong{display:block;margin-top:8px;color:var(--text-strong);font-size:14px}.empty p{font-size:12px}
</style>
