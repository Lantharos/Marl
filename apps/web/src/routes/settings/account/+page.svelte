<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import { onMount, untrack } from 'svelte';
  import QRCode from 'qrcode';
  import Check from 'lucide-svelte/icons/check';
  import KeyRound from 'lucide-svelte/icons/key-round';
  import Link from 'lucide-svelte/icons/link';
  import ShieldCheck from 'lucide-svelte/icons/shield-check';
  import Trash2 from 'lucide-svelte/icons/trash-2';
  import Checkbox from '$lib/components/Checkbox.svelte';
  import Modal from '$lib/components/Modal.svelte';
  import { authClient } from '$lib/auth-client';
  import { api, StyApiError } from '$lib/api';
  import { formatTimestamp } from '$lib/time';
  import type { PageData } from './$types';

  let { data } = $props<{ data: PageData }>();
  let tokens = $state(untrack(() => [...data.tokens]));
  let tokenDialog = $state(false);
  let twoFactorDialog = $state(false);
  let twoFactorEnabled = $state(untrack(() => data.twoFactorEnabled));
  let disablingTwoFactor = $state(false);
  let twoFactorConfirmed = $state(false);
  let twoFactorPassword = $state('');
  let twoFactorCode = $state('');
  let totpUri = $state('');
  let totpQr = $state('');
  let backupCodes = $state<string[]>([]);
  let tokenName = $state('');
  let repoRead = $state(true);
  let repoWrite = $state(false);
  let repoAdmin = $state(false);
  let workflows = $state(false);
  let newToken = $state('');
  let busy = $state('');
  let notice = $state('');
  let error = $state('');
  let sessions = $state<Array<{ id: string; token: string; userAgent?: string | null; ipAddress?: string | null; createdAt: Date | string }>>([]);

  onMount(() => { void loadSessions(); });

  async function loadSessions() {
    const result = await authClient.listSessions();
    if (result.data) sessions = result.data;
  }

  async function revokeSession(token: string) {
    await authClient.revokeSession({ token });
    sessions = sessions.filter((session) => session.token !== token);
  }

  async function addPasskey() {
    busy = 'passkey'; error = ''; notice = '';
    const result = await authClient.passkey.addPasskey({ name: 'Sty passkey' });
    busy = '';
    if (result.error) { error = result.error.message || 'The passkey could not be added.'; return; }
    notice = 'Passkey added.';
  }

  async function linkAve() {
    busy = 'ave'; error = '';
    const result = await authClient.oauth2.link({ providerId: 'ave', callbackURL: '/settings/account' });
    busy = '';
    if (result.error) error = result.error.message || 'Ave could not be linked.';
  }

  async function beginTwoFactor() {
    busy = 'two-factor'; error = '';
    const result = await authClient.twoFactor.enable({ password: twoFactorPassword });
    busy = '';
    if (result.error) { error = result.error.message || 'Two-factor authentication could not be enabled.'; return; }
    totpUri = result.data.totpURI;
    backupCodes = result.data.backupCodes;
    totpQr = await QRCode.toDataURL(totpUri, { width: 220, margin: 1, color: { dark: '#171719', light: '#f1f0ed' } });
  }

  async function confirmTwoFactor() {
    busy = 'two-factor'; error = '';
    const result = await authClient.twoFactor.verifyTotp({ code: twoFactorCode });
    busy = '';
    if (result.error) { error = result.error.message || 'That authentication code is not valid.'; return; }
    twoFactorEnabled = true;
    twoFactorConfirmed = true;
    notice = 'Two-factor authentication enabled. Save the recovery codes before closing.';
  }

  async function disableTwoFactor() {
    busy = 'two-factor'; error = '';
    const result = await authClient.twoFactor.disable({ password: twoFactorPassword });
    busy = '';
    if (result.error) { error = result.error.message || 'Two-factor authentication could not be disabled.'; return; }
    twoFactorEnabled = false; twoFactorDialog = false; twoFactorPassword = ''; notice = 'Two-factor authentication disabled.';
  }

  async function createToken() {
    const scopes = [repoRead && 'repo:read', repoWrite && 'repo:write', repoAdmin && 'repo:admin', workflows && 'workflow:dispatch'].filter(Boolean) as string[];
    if (!tokenName.trim() || !scopes.length) return;
    busy = 'token'; error = '';
    try {
      const result = await api<{ token: { id: string; name: string; value: string; tokenPrefix: string; scopes: string[]; expiresAt: string; lastUsedAt: null; createdAt?: string } }>('/tokens', { method: 'POST', body: JSON.stringify({ name: tokenName, scopes, expiresDays: 90 }) });
      newToken = result.token.value;
      tokens = [{ ...result.token, createdAt: new Date().toISOString(), lastUsedAt: null }, ...tokens];
    } catch (cause) { error = cause instanceof StyApiError ? cause.message : 'The developer token could not be created.'; }
    finally { busy = ''; }
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

<svelte:head><title>Account settings · Sty</title></svelte:head>
<div class="account-layout">
  <aside><h1>Account settings</h1><nav><a class="active" href="/settings/account"><ShieldCheck size={14} />Security and access</a><a href="/organizations">Organizations</a></nav></aside>
  <main>
    <header><h2>Security and access</h2><p>Sign-in methods and credentials that can operate on your code.</p></header>
    {#if notice}<p class="notice"><Check size={13} />{notice}</p>{/if}{#if error}<p class="error" role="alert">{error}</p>{/if}
    <section><div><h3>Passkeys</h3><p>Use your device or security key without entering a password.</p></div><button onclick={addPasskey} disabled={busy === 'passkey'}><KeyRound size={14} />Add passkey</button></section>
    <section><div><h3>Two-factor authentication</h3><p>{twoFactorEnabled ? 'Your password is protected by a second factor.' : 'Require an authenticator code after password sign-in.'}</p></div><button onclick={() => { disablingTwoFactor = twoFactorEnabled; twoFactorConfirmed = false; twoFactorDialog = true; twoFactorPassword = ''; twoFactorCode = ''; totpUri = ''; backupCodes = []; }}>{twoFactorEnabled ? 'Disable' : 'Set up'}</button></section>
    {#if data.methods.ave}<section><div><h3>Ave</h3><p>Link Ave as a convenience sign-in. Your Sty password remains independent.</p></div><button onclick={linkAve} disabled={busy === 'ave'}><Link size={14} />Link Ave</button></section>{/if}
    <div class="section-head"><div><h3>Sessions</h3><p>Browsers and devices currently signed in to your account.</p></div></div>
    <div class="token-list">{#each sessions as session}<article><div><strong>{session.userAgent || 'Unknown device'}</strong><span>{session.ipAddress || 'Unknown address'} · signed in {formatTimestamp(session.createdAt)}</span></div><button aria-label="Sign out this session" onclick={() => revokeSession(session.token)}><Trash2 size={14} /></button></article>{:else}<p class="empty">No other sessions.</p>{/each}</div>
    <div class="section-head"><div><h3>Developer tokens</h3><p>Scoped credentials for Git, the Sty CLI, and automation.</p></div><button class="primary" onclick={() => { tokenDialog = true; newToken = ''; }}>Create token</button></div>
    <div class="token-list">{#each tokens as token}<article><div><strong>{token.name}</strong><span>{token.tokenPrefix}… · expires {formatTimestamp(token.expiresAt)}</span><small>{token.scopes.join(', ')}{token.lastUsedAt ? ` · last used ${formatTimestamp(token.lastUsedAt)}` : ' · never used'}</small></div><button aria-label={`Revoke ${token.name}`} onclick={() => revokeToken(token.id)}><Trash2 size={14} /></button></article>{:else}<p class="empty">No developer tokens.</p>{/each}</div>
  </main>
</div>

{#snippet tokenActions()}{#if newToken}<button class="primary" onclick={() => (tokenDialog = false)}>Done</button>{:else}<button onclick={() => (tokenDialog = false)}>Cancel</button><button class="primary" disabled={busy === 'token'} onclick={createToken}>Create token</button>{/if}{/snippet}
<Modal open={tokenDialog} title="Create developer token" description="The secret is shown once. Store it somewhere safe." onClose={() => (tokenDialog = false)} actions={tokenActions}>
  {#if newToken}<div class="token-secret"><code>{newToken}</code><button onclick={copyToken}>Copy token</button></div>{:else}<div class="token-form"><label><span>Name</span><input bind:value={tokenName} placeholder="Laptop or deployment" /></label><div class="scopes"><Checkbox bind:checked={repoRead} label="Read repositories" /><Checkbox bind:checked={repoWrite} label="Push code" /><Checkbox bind:checked={repoAdmin} label="Manage repositories" /><Checkbox bind:checked={workflows} label="Dispatch workflows" /></div></div>{/if}
</Modal>

{#snippet twoFactorActions()}{#if disablingTwoFactor}<button onclick={() => (twoFactorDialog = false)}>Cancel</button><button class="danger-button" disabled={!twoFactorPassword || busy === 'two-factor'} onclick={disableTwoFactor}>Disable two-factor</button>{:else if twoFactorConfirmed}<button class="primary" onclick={() => (twoFactorDialog = false)}>Done</button>{:else if !totpUri}<button onclick={() => (twoFactorDialog = false)}>Cancel</button><button class="primary" disabled={!twoFactorPassword || busy === 'two-factor'} onclick={beginTwoFactor}>Continue</button>{:else}<button class="primary" disabled={twoFactorCode.length !== 6 || busy === 'two-factor'} onclick={confirmTwoFactor}>Verify and enable</button>{/if}{/snippet}
<Modal open={twoFactorDialog} title={disablingTwoFactor ? 'Disable two-factor authentication?' : 'Set up two-factor authentication'} description={disablingTwoFactor ? 'Your account will return to password and passkey protection.' : 'Your Sty password is required before changing account security.'} onClose={() => (twoFactorDialog = false)} actions={twoFactorActions}>{#if disablingTwoFactor || !totpUri}<label class="security-field"><span>Password</span><input type="password" autocomplete="current-password" bind:value={twoFactorPassword} /></label>{:else}<div class="totp-setup"><img src={totpQr} alt="Authenticator setup QR code" /><p>{twoFactorConfirmed ? 'Two-factor authentication is active. Save these recovery codes now.' : 'Scan this with your authenticator, then enter the six-digit code.'}</p>{#if !twoFactorConfirmed}<label class="security-field"><span>Authentication code</span><input inputmode="numeric" maxlength="6" autocomplete="one-time-code" bind:value={twoFactorCode} /></label>{/if}<details open={twoFactorConfirmed}><summary>Recovery codes</summary><div class="backup-codes">{#each backupCodes as code}<code>{code}</code>{/each}</div></details></div>{/if}</Modal>

<style>
  .account-layout{display:grid;width:min(1080px,calc(100% - 40px));grid-template-columns:205px minmax(0,760px);gap:42px;margin:0 auto;padding:42px 0 80px}.account-layout aside{position:sticky;top:76px;align-self:start}.account-layout aside h1{margin:0 0 12px;padding:0 8px;color:var(--text-faint);font-size:10px}.account-layout nav{display:grid;gap:2px}.account-layout nav a{display:flex;min-height:36px;align-items:center;gap:8px;padding:0 10px;border-radius:6px;color:var(--text-muted);font-size:10px;text-decoration:none}.account-layout nav a.active,.account-layout nav a:hover{background:var(--brand-soft);color:var(--text-strong)}main>header{padding-bottom:25px;border-bottom:1px solid var(--border-subtle)}h2{margin:0;color:var(--text-strong);font-size:23px;letter-spacing:-.03em}header p,.section-head p,section p{margin:6px 0 0;color:var(--text-muted);font-size:10px;line-height:1.5}section,.section-head{display:flex;align-items:center;justify-content:space-between;gap:24px;padding:22px 0;border-bottom:1px solid var(--border-subtle)}h3{margin:0;color:var(--text-strong);font-size:13px}button{display:inline-flex;height:34px;align-items:center;justify-content:center;gap:7px;padding:0 11px;border:1px solid var(--border);border-radius:6px;background:var(--surface);color:var(--text);cursor:pointer;font-size:10px;font-weight:630}button:hover{background:var(--surface-muted)}button.primary{border-color:var(--brand);background:var(--brand);color:white}button.danger-button{border-color:var(--danger);background:var(--danger);color:white}.token-list article{display:flex;align-items:center;justify-content:space-between;gap:18px;padding:15px 0;border-bottom:1px solid var(--border-subtle)}.token-list strong,.token-list span,.token-list small{display:block}.token-list strong{color:var(--text-strong);font-size:11px}.token-list span,.token-list small{margin-top:3px;color:var(--text-faint);font-size:9px}.token-list article>button{width:32px;padding:0;color:var(--danger)}.empty{padding:24px 0;color:var(--text-faint);font-size:10px}.notice,.error{display:flex;align-items:center;gap:7px;padding:9px 10px;border-radius:6px;font-size:10px}.notice{background:var(--success-soft);color:var(--success)}.error{background:var(--danger-soft);color:var(--danger)}.token-form,.token-form label,.security-field{display:grid;gap:8px}.token-form label span,.security-field span{color:var(--text-strong);font-size:10px;font-weight:630}.token-form input,.security-field input{height:37px;padding:0 9px;border:1px solid var(--border-strong);border-radius:6px;outline:0;background:var(--surface);color:var(--text-strong)}.scopes{margin:8px 0}.token-secret{display:grid;gap:12px}.token-secret code{overflow-wrap:anywhere;padding:12px;border-radius:6px;background:var(--canvas);color:var(--text-strong);font-size:10px}.token-secret button{justify-self:end}.totp-setup{display:grid;gap:12px}.totp-setup img{width:180px;margin:auto;border-radius:6px}.totp-setup p{margin:0;color:var(--text-muted);font-size:10px}.totp-setup details{color:var(--text-muted);font-size:10px}.backup-codes{display:grid;grid-template-columns:repeat(2,1fr);gap:5px;margin-top:9px}.backup-codes code{padding:6px;border-radius:4px;background:var(--canvas);text-align:center}@media(max-width:720px){.account-layout{grid-template-columns:1fr}.account-layout aside{position:static}}
</style>
