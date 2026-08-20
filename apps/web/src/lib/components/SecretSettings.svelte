<script lang="ts">
  import { untrack } from 'svelte';
  import KeyRound from 'lucide-svelte/icons/key-round';
  import Trash2 from 'lucide-svelte/icons/trash-2';
  import { api, MarlApiError } from '$lib/api';
  import Button from './Button.svelte';
  import Time from './Time.svelte';

  type Secret = { id: string; name: string; createdAt: string; updatedAt: string };
  let { initialSecrets, endpoint, scope }: { initialSecrets: Secret[]; endpoint: string; scope: 'repository' | 'organization' } = $props();
  let secrets = $state<Secret[]>(untrack(() => initialSecrets));
  let name = $state('');
  let value = $state('');
  let busy = $state(false);
  let error = $state('');

  async function save() {
    if (busy || !name || !value) return;
    busy = true;
    error = '';
    const normalized = name.trim().toUpperCase();
    try {
      await api(`${endpoint}/${encodeURIComponent(normalized)}`, { method: 'PUT', body: JSON.stringify({ value }) });
      const now = new Date().toISOString();
      const existing = secrets.find((secret) => secret.name === normalized);
      secrets = existing ? secrets.map((secret) => secret.name === normalized ? { ...secret, updatedAt: now } : secret) : [...secrets, { id: normalized, name: normalized, createdAt: now, updatedAt: now }].sort((a, b) => a.name.localeCompare(b.name));
      name = '';
      value = '';
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
    } catch (cause) {
      error = cause instanceof MarlApiError ? cause.message : 'The secret could not be removed.';
    } finally { busy = false; }
  }
</script>

<header class="page-head"><h1>CI secrets</h1><p>{scope === 'organization' ? 'Shared with jobs in every organization repository. Repository secrets with the same name take precedence.' : 'Encrypted values are injected into jobs as environment variables and automatically masked from runner logs.'}</p></header>
<form onsubmit={(event) => { event.preventDefault(); void save(); }}>
  <label><span>Name</span><input bind:value={name} oninput={() => (name = name.toUpperCase().replace(/[^A-Z0-9_]/g, ''))} placeholder="DEPLOY_TOKEN" autocomplete="off" /></label>
  <label><span>Value</span><input bind:value={value} type="password" placeholder="Secret value" autocomplete="new-password" /></label>
  <Button type="submit" variant="primary" size="large" disabled={busy || !name || !value}>{busy ? 'Saving…' : 'Add secret'}</Button>
</form>
{#if error}<p class="error" role="alert">{error}</p>{/if}
<section>
  {#each secrets as secret}
    <article><span class="icon"><KeyRound size={16} /></span><span><strong>{secret.name}</strong><small>Updated <Time value={secret.updatedAt} /></small></span><Button variant="danger-soft" icon aria-label="Delete {secret.name}" onclick={() => remove(secret)}><Trash2 size={15} /></Button></article>
  {:else}<div class="empty"><KeyRound size={22} /><strong>No {scope} secrets</strong><p>{scope === 'organization' ? 'Add a shared value for organization workflows.' : 'Organization secrets still apply unless a repository secret uses the same name.'}</p></div>{/each}
</section>

<style>
  .page-head{padding-bottom:24px;border-bottom:1px solid var(--border-subtle)}h1{margin:0;color:var(--text-strong);font-size:25px;letter-spacing:-.03em}.page-head p{max-width:650px;margin:7px 0 0;color:var(--text-muted);font-size:13px;line-height:1.5}form{display:grid;grid-template-columns:210px minmax(0,1fr) auto;align-items:end;gap:12px;padding:24px 0;border-bottom:1px solid var(--border)}label{display:grid;gap:7px}label span{color:var(--text-strong);font-size:12px;font-weight:630}input{height:38px;padding:0 10px;border:1px solid var(--border-strong);border-radius:6px;outline:0;background:var(--surface);color:var(--text-strong);font-size:13px}input:focus{border-color:var(--brand)}.error{padding:10px;border-radius:6px;background:var(--danger-soft);color:var(--danger);font-size:12px}article{display:grid;grid-template-columns:36px minmax(0,1fr) 38px;align-items:center;gap:10px;min-height:68px;border-bottom:1px solid var(--border-subtle)}.icon{display:grid;width:32px;height:32px;color:var(--text-muted);place-items:center}article strong,article small{display:block}article strong{color:var(--text-strong);font-size:13px}article small{margin-top:4px;color:var(--text-muted);font-size:11px}.empty{padding:54px 0;color:var(--text-muted);text-align:center}.empty strong{display:block;margin-top:8px;color:var(--text-strong);font-size:14px}.empty p{font-size:12px}@media(max-width:700px){form{grid-template-columns:1fr}form :global(.button){justify-self:start}}
</style>
