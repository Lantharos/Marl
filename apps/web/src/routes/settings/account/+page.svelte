<script lang="ts">
  import { untrack } from 'svelte';
  import QRCode from 'qrcode';
  import Check from 'lucide-svelte/icons/check';
  import KeyRound from 'lucide-svelte/icons/key-round';
  import Modal from '$lib/components/Modal.svelte';
  import Button from '$lib/components/Button.svelte';
  import { authClient } from '$lib/auth-client';
  import type { PageData } from './$types';

  let { data } = $props<{ data: PageData }>();
  let twoFactorDialog = $state(false);
  let twoFactorEnabled = $state(untrack(() => data.twoFactorEnabled));
  let disablingTwoFactor = $state(false);
  let twoFactorConfirmed = $state(false);
  let twoFactorPassword = $state('');
  let twoFactorCode = $state('');
  let totpUri = $state('');
  let totpQr = $state('');
  let backupCodes = $state<string[]>([]);
  let busy = $state('');
  let passkeyState = $state<'idle' | 'saving' | 'saved'>('idle');
  let error = $state('');

  async function addPasskey() {
    busy = 'passkey'; passkeyState = 'saving'; error = '';
    const result = await authClient.passkey.addPasskey({ name: 'Marl passkey' });
    busy = '';
    if (result.error) { passkeyState = 'idle'; error = result.error.message || 'The passkey could not be added.'; return; }
    passkeyState = 'saved';
    setTimeout(() => (passkeyState = 'idle'), 1800);
  }

  async function beginTwoFactor() {
    busy = 'two-factor'; error = '';
    const result = await authClient.twoFactor.enable({ password: twoFactorPassword, method: 'totp' });
    busy = '';
    if (result.error) { error = result.error.message || 'Two-factor authentication could not be enabled.'; return; }
    if (result.data.method !== 'totp') { error = 'Two-factor setup returned an unexpected verification method.'; return; }
    totpUri = result.data.totpURI;
    backupCodes = result.data.backupCodes;
    totpQr = await QRCode.toDataURL(totpUri, { width: 220, margin: 1, color: { dark: '#171719', light: '#f1f0ed' } });
  }

  async function confirmTwoFactor() {
    busy = 'two-factor'; error = '';
    const result = await authClient.twoFactor.verifyTotp({ code: twoFactorCode });
    busy = '';
    if (result.error) { error = result.error.message || 'That authentication code is not valid.'; return; }
    twoFactorEnabled = true; twoFactorConfirmed = true;
  }

  async function disableTwoFactor() {
    busy = 'two-factor'; error = '';
    const result = await authClient.twoFactor.disable({ password: twoFactorPassword });
    busy = '';
    if (result.error) { error = result.error.message || 'Two-factor authentication could not be disabled.'; return; }
    twoFactorEnabled = false; twoFactorDialog = false; twoFactorPassword = '';
  }
</script>

<svelte:head><title>Sign-in and security · Marl</title></svelte:head>
<header class="page-head"><h2>Sign-in and security</h2><p>Manage how you prove it is you when accessing Marl.</p></header>
{#if error}<p class="error" role="alert">{error}</p>{/if}
<section><div><h3>Passkeys</h3><p>Use your device or security key without entering a password.</p></div><Button loading={passkeyState === 'saving'} onclick={addPasskey} disabled={passkeyState !== 'idle'}>{#if passkeyState === 'saved'}<Check size={14} />Added!{:else}<KeyRound size={14} />{passkeyState === 'saving' ? 'Adding' : 'Add passkey'}{/if}</Button></section>
<section><div><h3>Two-factor authentication</h3><p>{twoFactorEnabled ? 'Your password is protected by a second factor.' : 'Require an authenticator code after password sign-in.'}</p></div><Button variant={twoFactorEnabled ? 'danger-soft' : 'secondary'} onclick={() => { disablingTwoFactor = twoFactorEnabled; twoFactorConfirmed = false; twoFactorDialog = true; twoFactorPassword = ''; twoFactorCode = ''; totpUri = ''; backupCodes = []; }}>{twoFactorEnabled ? 'Disable' : 'Set up'}</Button></section>

{#snippet twoFactorActions()}{#if disablingTwoFactor}<Button size="small" onclick={() => (twoFactorDialog = false)}>Cancel</Button><Button size="small" variant="danger" disabled={!twoFactorPassword || busy === 'two-factor'} onclick={disableTwoFactor}>Disable two-factor</Button>{:else if twoFactorConfirmed}<Button size="small" variant="primary" onclick={() => (twoFactorDialog = false)}>Done</Button>{:else if !totpUri}<Button size="small" onclick={() => (twoFactorDialog = false)}>Cancel</Button><Button size="small" variant="primary" disabled={!twoFactorPassword || busy === 'two-factor'} onclick={beginTwoFactor}>Continue</Button>{:else}<Button size="small" variant="primary" disabled={twoFactorCode.length !== 6 || busy === 'two-factor'} onclick={confirmTwoFactor}>Verify and enable</Button>{/if}{/snippet}
<Modal open={twoFactorDialog} title={disablingTwoFactor ? 'Disable two-factor authentication?' : 'Set up two-factor authentication'} description={disablingTwoFactor ? 'Your account will return to password and passkey protection.' : 'Enter your Marl password before changing account security.'} onClose={() => (twoFactorDialog = false)} actions={twoFactorActions}>{#if disablingTwoFactor || !totpUri}<label class="security-field"><span>Password</span><input type="password" autocomplete="current-password" bind:value={twoFactorPassword} /></label>{:else}<div class="totp-setup"><img src={totpQr} alt="Authenticator setup QR code" /><p>{twoFactorConfirmed ? 'Two-factor authentication is active. Save these recovery codes now.' : 'Scan this with your authenticator, then enter the six-digit code.'}</p>{#if !twoFactorConfirmed}<label class="security-field"><span>Authentication code</span><input inputmode="numeric" maxlength="6" autocomplete="one-time-code" bind:value={twoFactorCode} /></label>{/if}<details open={twoFactorConfirmed}><summary>Recovery codes</summary><div class="backup-codes">{#each backupCodes as code (code)}<code>{code}</code>{/each}</div></details></div>{/if}</Modal>

<style>
  .page-head{padding-bottom:25px;border-bottom:1px solid var(--border-subtle)}h2{margin:0;color:var(--text-strong);font-size:23px;letter-spacing:-.03em}.page-head p,section p{margin:6px 0 0;color:var(--text-muted);font-size:10px;line-height:1.5}section{display:flex;align-items:center;justify-content:space-between;gap:24px;padding:22px 0;border-bottom:1px solid var(--border-subtle)}h3{margin:0;color:var(--text-strong);font-size:13px}.error{display:flex;align-items:center;gap:7px;padding:9px 10px;border-radius:6px;background:var(--danger-soft);color:var(--danger);font-size:10px}.security-field{display:grid;gap:8px}.security-field span{color:var(--text-strong);font-size:10px;font-weight:630}.security-field input{height:37px;padding:0 9px;border:1px solid var(--border-strong);border-radius:6px;outline:0;background:var(--surface);color:var(--text-strong)}.totp-setup{display:grid;gap:12px}.totp-setup img{width:180px;margin:auto;border-radius:6px}.totp-setup p{margin:0;color:var(--text-muted);font-size:10px}.totp-setup details{color:var(--text-muted);font-size:10px}.backup-codes{display:grid;grid-template-columns:repeat(2,1fr);gap:5px;margin-top:9px}.backup-codes code{padding:6px;border-radius:4px;background:var(--canvas);text-align:center}
</style>
