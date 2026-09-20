<script lang="ts">
  import { untrack } from 'svelte';
  import KeyRound from 'lucide-svelte/icons/key-round';
  import Trash2 from 'lucide-svelte/icons/trash-2';
  import { api, MarlApiError } from '$lib/api';
  import Button from '$lib/components/Button.svelte';
  import Modal from '$lib/components/Modal.svelte';
  import Time from '$lib/components/Time.svelte';
  import type { PageData } from './$types';

  type SshKey = { id: string; name: string; fingerprint: string; lastUsedAt: string | null; createdAt: string };
  let { data } = $props<{ data: PageData }>();
  let sshKeys = $state<SshKey[]>(untrack(() => data.sshKeys));
  let name = $state('');
  let publicKey = $state('');
  let busy = $state(false);
  let open = $state(false);
  let error = $state('');

  async function addKey() {
    if (busy || !name.trim() || !publicKey.trim()) return;
    busy = true;
    error = '';
    try {
      const result = await api<{ sshKey: SshKey }>('/ssh-keys', { method: 'POST', body: JSON.stringify({ name: name.trim(), publicKey: publicKey.trim() }) });
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
    } catch (cause) {
      error = cause instanceof MarlApiError ? cause.message : 'The SSH key could not be removed.';
    } finally {
      busy = false;
    }
  }

</script>

<svelte:head><title>SSH keys · Marl</title></svelte:head>
<header class="page-head"><h2>SSH keys</h2><Button size="small" onclick={() => { error = ''; open = true; }}>Add SSH key</Button></header>
<Modal {open} title="Add SSH key" onClose={() => { if (!busy) open = false; }} --modal-width="540px">
<form id="ssh-key-form" onsubmit={(event) => { event.preventDefault(); void addKey(); }}>
  <label><span>Name</span><input bind:value={name} placeholder="Work laptop" autocomplete="off" data-1p-ignore /></label>
  <label><span>Public key</span><textarea bind:value={publicKey} placeholder="ssh-ed25519 AAAA…" rows="3" data-1p-ignore></textarea></label>
</form>
{#if error}<p class="error" role="alert">{error}</p>{/if}
{#snippet actions()}<Button size="small" disabled={busy} onclick={() => open = false}>Cancel</Button><Button size="small" type="submit" form="ssh-key-form" variant="primary" loading={busy} disabled={!name.trim() || !publicKey.trim()}>Add key</Button>{/snippet}
</Modal>
{#if error && !open}<p class="error" role="alert">{error}</p>{/if}
<div class="key-list">
  {#each sshKeys as key (key.id)}
    <article><span class="key-icon"><KeyRound size={17} /></span><div><strong>{key.name}</strong><code>{key.fingerprint}</code><small>Added <Time value={key.createdAt} />{#if key.lastUsedAt} · last used <Time value={key.lastUsedAt} />{:else} · never used{/if}</small></div><Button variant="danger-soft" icon aria-label={`Remove ${key.name}`} onclick={() => removeKey(key)}><Trash2 size={15} /></Button></article>
  {:else}<div class="empty"><KeyRound size={24} /><strong>No SSH keys</strong><p>Add a public key to use the SSH clone URL shown on repositories.</p></div>{/each}
</div>

<style>
  .page-head{display:flex;align-items:center;justify-content:space-between;gap:16px}.key-list{padding:6px 20px;border-radius:14px;background:var(--surface);box-shadow:var(--shadow-surface)}
  .page-head{padding-bottom:24px;}h2{margin:0;color:var(--text-strong);font-size:25px;letter-spacing:-.03em}form{display:grid;gap:18px;}label{display:grid;gap:7px}label span{color:var(--text-strong);font-size:12px;font-weight:630}input,textarea{box-sizing:border-box;width:100%;padding:9px 10px;border:1px solid var(--border);border-radius:8px;outline:0;background:var(--surface);color:var(--text-strong);font:inherit;font-size:13px}input{height:38px}textarea{min-height:78px;resize:vertical;font-family:var(--font-mono)}input:focus,textarea:focus{border-color:var(--brand)}.error{padding:10px;border-radius:8px;background:var(--danger-soft);color:var(--danger);font-size:12px}.key-list article{display:grid;grid-template-columns:38px minmax(0,1fr) 38px;align-items:center;gap:11px;min-height:78px;}.key-icon{display:grid;width:34px;height:34px;color:var(--text-muted);place-items:center}.key-list strong,.key-list code,.key-list small{display:block}.key-list strong{color:var(--text-strong);font-size:13px}.key-list code{overflow:hidden;margin-top:4px;color:var(--text);font-size:11px;text-overflow:ellipsis;white-space:nowrap}.key-list small{margin-top:4px;color:var(--text-muted);font-size:11px}.empty{padding:52px 0;color:var(--text-muted);text-align:center}.empty strong{display:block;margin-top:8px;color:var(--text-strong);font-size:14px}.empty p{font-size:12px}
</style>
