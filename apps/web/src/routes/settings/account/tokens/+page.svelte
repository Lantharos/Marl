<script lang="ts">
  import { untrack } from 'svelte';
  import Check from 'lucide-svelte/icons/check';
  import Trash2 from 'lucide-svelte/icons/trash-2';
  import Button from '$lib/components/Button.svelte';
  import Checkbox from '$lib/components/Checkbox.svelte';
  import Modal from '$lib/components/Modal.svelte';
  import { api, MarlApiError } from '$lib/api';
  import { formatTimestamp } from '$lib/time';
  import type { PageData } from './$types';

  let { data } = $props<{ data: PageData }>();
  let tokens = $state(untrack(() => [...data.tokens]));
  let tokenDialog = $state(false);
  let tokenName = $state('');
  let repoRead = $state(true);
  let repoWrite = $state(false);
  let repoAdmin = $state(false);
  let workflows = $state(false);
  let newToken = $state('');
  let busy = $state(false);
  let notice = $state('');
  let error = $state('');

  async function createToken() {
    const scopes = [repoRead && 'repo:read', repoWrite && 'repo:write', repoAdmin && 'repo:admin', workflows && 'workflow:dispatch'].filter(Boolean) as string[];
    if (!tokenName.trim() || !scopes.length) return;
    busy = true; error = '';
    try {
      const result = await api<{ token: { id: string; name: string; value: string; tokenPrefix: string; scopes: string[]; expiresAt: string; lastUsedAt: null; createdAt?: string } }>('/tokens', { method: 'POST', body: JSON.stringify({ name: tokenName, scopes, expiresDays: 90 }) });
      newToken = result.token.value;
      tokens = [{ ...result.token, createdAt: new Date().toISOString(), lastUsedAt: null }, ...tokens];
    } catch (cause) { error = cause instanceof MarlApiError ? cause.message : 'The developer token could not be created.'; }
    finally { busy = false; }
  }

  async function revokeToken(id: string) {
    await api(`/tokens/${id}`, { method: 'DELETE' });
    tokens = tokens.filter((token) => token.id !== id);
  }

  async function copyToken() {
    await navigator.clipboard.writeText(newToken);
    notice = 'Token copied. It will not be shown again.';
  }
</script>

<svelte:head><title>Developer access · Marl</title></svelte:head>
<header class="page-head"><div><h2>Developer access</h2><p>Scoped credentials for Git, the Marl CLI, and automation.</p></div><Button variant="primary" onclick={() => { tokenDialog = true; newToken = ''; notice = ''; }}>Create token</Button></header>
{#if notice}<p class="notice"><Check size={13} />{notice}</p>{/if}{#if error}<p class="error" role="alert">{error}</p>{/if}
<div class="token-list">{#each tokens as token}<article><div><strong>{token.name}</strong><span>{token.tokenPrefix}… · expires {formatTimestamp(token.expiresAt)}</span><small>{token.scopes.join(', ')}{token.lastUsedAt ? ` · last used ${formatTimestamp(token.lastUsedAt)}` : ' · never used'}</small></div><Button variant="danger-soft" size="small" icon aria-label={`Revoke ${token.name}`} onclick={() => revokeToken(token.id)}><Trash2 size={14} /></Button></article>{:else}<p class="empty">No developer tokens.</p>{/each}</div>

{#snippet tokenActions()}{#if newToken}<Button size="small" variant="primary" onclick={() => (tokenDialog = false)}>Done</Button>{:else}<Button size="small" onclick={() => (tokenDialog = false)}>Cancel</Button><Button size="small" variant="primary" disabled={busy} onclick={createToken}>Create token</Button>{/if}{/snippet}
<Modal open={tokenDialog} title="Create developer token" description="The secret is shown once. Store it somewhere safe." onClose={() => (tokenDialog = false)} actions={tokenActions}>{#if newToken}<div class="token-secret"><code>{newToken}</code><Button size="small" onclick={copyToken}>Copy token</Button></div>{:else}<div class="token-form"><label><span>Name</span><input bind:value={tokenName} placeholder="Laptop or deployment" /></label><div class="scopes"><Checkbox bind:checked={repoRead} label="Read repositories" /><Checkbox bind:checked={repoWrite} label="Push code" /><Checkbox bind:checked={repoAdmin} label="Manage repositories" /><Checkbox bind:checked={workflows} label="Dispatch workflows" /></div></div>{/if}</Modal>

<style>
  .page-head{display:flex;align-items:center;justify-content:space-between;gap:20px;padding-bottom:25px;border-bottom:1px solid var(--border-subtle)}h2{margin:0;color:var(--text-strong);font-size:23px;letter-spacing:-.03em}.page-head p{margin:6px 0 0;color:var(--text-muted);font-size:10px;line-height:1.5}.token-list article{display:flex;align-items:center;justify-content:space-between;gap:18px;padding:15px 0;border-bottom:1px solid var(--border-subtle)}.token-list strong,.token-list span,.token-list small{display:block}.token-list strong{color:var(--text-strong);font-size:11px}.token-list span,.token-list small{margin-top:3px;color:var(--text-faint);font-size:9px}.empty{padding:24px 0;color:var(--text-faint);font-size:10px}.notice,.error{display:flex;align-items:center;gap:7px;padding:9px 10px;border-radius:6px;font-size:10px}.notice{background:var(--success-soft);color:var(--success)}.error{background:var(--danger-soft);color:var(--danger)}.token-form,.token-form label{display:grid;gap:8px}.token-form label span{color:var(--text-strong);font-size:10px;font-weight:630}.token-form input{height:37px;padding:0 9px;border:1px solid var(--border-strong);border-radius:6px;outline:0;background:var(--surface);color:var(--text-strong)}.scopes{margin:8px 0}.token-secret{display:grid;gap:12px}.token-secret code{overflow-wrap:anywhere;padding:12px;border-radius:6px;background:var(--canvas);color:var(--text-strong);font-size:10px}.token-secret :global(.button){justify-self:end}
</style>
