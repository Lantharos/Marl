<script lang="ts">
  import { untrack } from 'svelte';
  import KeyRound from 'lucide-svelte/icons/key-round';
  import Trash2 from 'lucide-svelte/icons/trash-2';
  import { api, MarlApiError } from '$lib/api';
  import Button from '../Button.svelte';
  import Modal from '../Modal.svelte';
  import Time from '../Time.svelte';

  type Secret = { id: string; name: string; createdAt: string; updatedAt: string };
  let { initialSecrets, endpoint, scope }: { initialSecrets: Secret[]; endpoint: string; scope: 'repository' | 'organization' } = $props();
  let secrets = $state<Secret[]>(untrack(() => initialSecrets));
  let name = $state('');
  let value = $state('');
  let busy = $state(false);
  let open = $state(false);
  let editing = $state(false);
  let removing = $state<Secret | null>(null);
  let error = $state('');

  async function save() {
    if (busy || !name || !value) return;
    busy = true;
    error = '';
    const normalized = name.trim().toUpperCase();
    if (!editing && secrets.some(secret => secret.name === normalized)) {
      error = 'This secret already exists. Use Change to replace its value.';
      busy = false;
      return;
    }
    try {
      await api(`${endpoint}/${encodeURIComponent(normalized)}`, { method: 'PUT', body: JSON.stringify({ value }) });
      const now = new Date().toISOString();
      const existing = secrets.find((secret) => secret.name === normalized);
      secrets = existing ? secrets.map((secret) => secret.name === normalized ? { ...secret, updatedAt: now } : secret) : [...secrets, { id: normalized, name: normalized, createdAt: now, updatedAt: now }].sort((a, b) => a.name.localeCompare(b.name));
      name = '';
      value = '';
      open = false;
    } catch (cause) {
      error = cause instanceof MarlApiError ? cause.message : 'The secret could not be saved.';
    } finally { busy = false; }
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
    } finally { busy = false; }
  }
</script>

<header class="page-head"><h1>CI secrets</h1><Button size="small" onclick={() => { name = ''; value = ''; editing = false; error = ''; open = true; }}>Add secret</Button></header>
<p class="scope-note">{scope === 'organization' ? 'Shared with organization repositories. A repository secret with the same name takes precedence.' : 'Repository secrets override organization secrets with the same name.'}</p>
<section class="secret-list" aria-label="CI secrets">
  {#each secrets as secret (secret.id)}
    <article><span class="icon"><KeyRound size={17} /></span><span class="secret-name"><strong>{secret.name}</strong><small>Updated <Time value={secret.updatedAt} /></small></span><Button size="small" aria-label="Change {secret.name}" aria-haspopup="dialog" onclick={() => { name = secret.name; value = ''; editing = true; error = ''; open = true; }}>Change</Button><Button variant="ghost" size="small" icon aria-label="Delete {secret.name}" onclick={() => { error = ''; removing = secret; }}><Trash2 size={15} /></Button></article>
  {:else}<div class="empty"><KeyRound size={19} /><span>No {scope} secrets</span></div>{/each}
</section>

<Modal {open} title={editing ? 'Change secret' : 'Add secret'} onClose={() => { if (!busy) { open = false; value = ''; } }} --modal-width="540px">
  <form id="secret-form" onsubmit={(event) => { event.preventDefault(); void save(); }}>
    <label><span>Name</span><input bind:value={name} disabled={editing || busy} oninput={() => (name = name.toUpperCase().replace(/[^A-Z0-9_]/g, ''))} placeholder="DEPLOY_TOKEN" autocomplete="off" required /></label>
    <label><span>{editing ? 'New value' : 'Value'}</span><input bind:value={value} disabled={busy} type="password" placeholder="Secret value" autocomplete="new-password" required /></label>
  </form>
  <p class="note">Encrypted and masked from runner logs. Saved values cannot be read back.</p>
  {#if error}<p class="error" role="alert">{error}</p>{/if}
  {#snippet actions()}<Button size="small" disabled={busy} onclick={() => { open = false; value = ''; }}>Cancel</Button><Button type="submit" form="secret-form" variant="primary" size="small" loading={busy} disabled={!name || !value}>Save</Button>{/snippet}
</Modal>
<Modal open={removing !== null} title="Delete secret?" onClose={() => { if (!busy) removing = null; }} --modal-width="540px">
  <p class="delete-note"><strong>{removing?.name}</strong> will no longer be available to new jobs.</p>
  {#if error}<p class="error" role="alert">{error}</p>{/if}
  {#snippet actions()}<Button size="small" disabled={busy} onclick={() => (removing = null)}>Cancel</Button><Button size="small" variant="danger" loading={busy} onclick={() => { if (removing) void remove(removing); }}>Delete secret</Button>{/snippet}
</Modal>

<style>
  .page-head{display:flex;align-items:center;justify-content:space-between;gap:16px}h1{margin:0;color:var(--text-strong);font-size:22px;letter-spacing:-.03em}.scope-note{margin:0 0 24px;color:var(--text-muted);font-size:13px;line-height:1.6}.secret-list{padding:0 20px;border-radius:14px;background:var(--surface);box-shadow:var(--shadow-surface)}article{display:grid;grid-template-columns:24px minmax(0,1fr) auto auto;align-items:center;gap:12px;min-height:82px}.icon{display:grid;place-items:center;color:var(--text-muted)}.secret-name{min-width:0;overflow-wrap:anywhere}article strong,article small{display:block}article strong{color:var(--text-strong);font-size:14px}article small{margin-top:5px;color:var(--text-muted);font-size:12px}.empty{display:flex;align-items:center;gap:12px;min-height:82px;color:var(--text-muted);font-size:13px}form{display:grid;gap:20px}label{display:grid;gap:8px}label span{color:var(--text-strong);font-size:13px;font-weight:600}input{min-width:0;width:100%;height:42px;padding:0 12px;border:1px solid var(--border);border-radius:9px;outline:0;background:var(--surface);color:var(--text-strong);font:inherit;font-size:13px}input:focus{border-color:var(--brand)}input:disabled{color:var(--text-muted)}.note,.delete-note{margin:16px 0 0;color:var(--text-muted);font-size:13px;line-height:1.6}.delete-note{margin:0}.delete-note strong{color:var(--text-strong);overflow-wrap:anywhere}.error{margin:16px 0 0;color:var(--danger);font-size:13px}@media(max-width:520px){.secret-list{padding:0 14px}article{grid-template-columns:minmax(0,1fr) auto auto;gap:8px}.icon{display:none}}
</style>
