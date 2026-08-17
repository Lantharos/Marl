<script lang="ts">
  import { untrack } from 'svelte';
  import QRCode from 'qrcode';
  import Check from 'lucide-svelte/icons/check';
  import KeyRound from 'lucide-svelte/icons/key-round';
  import Link from 'lucide-svelte/icons/link';
  import Modal from '$lib/components/Modal.svelte';
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
  let notice = $state('');
  let error = $state('');

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
    twoFactorEnabled = true; twoFactorConfirmed = true; notice = 'Two-factor authentication enabled. Save the recovery codes before closing.';
  }

  async function disableTwoFactor() {
    busy = 'two-factor'; error = '';
    const result = await authClient.twoFactor.disable({ password: twoFactorPassword });
    busy = '';
    if (result.error) { error = result.error.message || 'Two-factor authentication could not be disabled.'; return; }
    twoFactorEnabled = false; twoFactorDialog = false; twoFactorPassword = ''; notice = 'Two-factor authentication disabled.';
  }
</script>

<svelte:head><title>Sign-in and security · Sty</title></svelte:head>
<header class="page-head"><h2>Sign-in and security</h2><p>Manage how you prove it is you when accessing Sty.</p></header>
{#if notice}<p class="notice"><Check size={13} />{notice}</p>{/if}{#if error}<p class="error" role="alert">{error}</p>{/if}
<section><div><h3>Passkeys</h3><p>Use your device or security key without entering a password.</p></div><button onclick={addPasskey} disabled={busy === 'passkey'}><KeyRound size={14} />Add passkey</button></section>
<section><div><h3>Two-factor authentication</h3><p>{twoFactorEnabled ? 'Your password is protected by a second factor.' : 'Require an authenticator code after password sign-in.'}</p></div><button onclick={() => { disablingTwoFactor = twoFactorEnabled; twoFactorConfirmed = false; twoFactorDialog = true; twoFactorPassword = ''; twoFactorCode = ''; totpUri = ''; backupCodes = []; }}>{twoFactorEnabled ? 'Disable' : 'Set up'}</button></section>
{#if data.methods.ave}<section><div><h3>Ave</h3><p>Use your Ave identity as an additional way to sign in.</p></div><button onclick={linkAve} disabled={busy === 'ave'}><Link size={14} />Link Ave</button></section>{/if}

{#snippet twoFactorActions()}{#if disablingTwoFactor}<button onclick={() => (twoFactorDialog = false)}>Cancel</button><button class="danger-button" disabled={!twoFactorPassword || busy === 'two-factor'} onclick={disableTwoFactor}>Disable two-factor</button>{:else if twoFactorConfirmed}<button class="primary" onclick={() => (twoFactorDialog = false)}>Done</button>{:else if !totpUri}<button onclick={() => (twoFactorDialog = false)}>Cancel</button><button class="primary" disabled={!twoFactorPassword || busy === 'two-factor'} onclick={beginTwoFactor}>Continue</button>{:else}<button class="primary" disabled={twoFactorCode.length !== 6 || busy === 'two-factor'} onclick={confirmTwoFactor}>Verify and enable</button>{/if}{/snippet}
<Modal open={twoFactorDialog} title={disablingTwoFactor ? 'Disable two-factor authentication?' : 'Set up two-factor authentication'} description={disablingTwoFactor ? 'Your account will return to password and passkey protection.' : 'Enter your Sty password before changing account security.'} onClose={() => (twoFactorDialog = false)} actions={twoFactorActions}>{#if disablingTwoFactor || !totpUri}<label class="security-field"><span>Password</span><input type="password" autocomplete="current-password" bind:value={twoFactorPassword} /></label>{:else}<div class="totp-setup"><img src={totpQr} alt="Authenticator setup QR code" /><p>{twoFactorConfirmed ? 'Two-factor authentication is active. Save these recovery codes now.' : 'Scan this with your authenticator, then enter the six-digit code.'}</p>{#if !twoFactorConfirmed}<label class="security-field"><span>Authentication code</span><input inputmode="numeric" maxlength="6" autocomplete="one-time-code" bind:value={twoFactorCode} /></label>{/if}<details open={twoFactorConfirmed}><summary>Recovery codes</summary><div class="backup-codes">{#each backupCodes as code}<code>{code}</code>{/each}</div></details></div>{/if}</Modal>

<style>
  .page-head{padding-bottom:25px;border-bottom:1px solid var(--border-subtle)}h2{margin:0;color:var(--text-strong);font-size:23px;letter-spacing:-.03em}.page-head p,section p{margin:6px 0 0;color:var(--text-muted);font-size:10px;line-height:1.5}section{display:flex;align-items:center;justify-content:space-between;gap:24px;padding:22px 0;border-bottom:1px solid var(--border-subtle)}h3{margin:0;color:var(--text-strong);font-size:13px}button{display:inline-flex;height:34px;align-items:center;justify-content:center;gap:7px;padding:0 11px;border:1px solid var(--border);border-radius:6px;background:var(--surface);color:var(--text);cursor:pointer;font-size:10px;font-weight:630}button:hover{background:var(--surface-muted)}button.primary{border-color:var(--brand);background:var(--brand);color:white}button.danger-button{border-color:var(--danger);background:var(--danger);color:white}.notice,.error{display:flex;align-items:center;gap:7px;padding:9px 10px;border-radius:6px;font-size:10px}.notice{background:var(--success-soft);color:var(--success)}.error{background:var(--danger-soft);color:var(--danger)}.security-field{display:grid;gap:8px}.security-field span{color:var(--text-strong);font-size:10px;font-weight:630}.security-field input{height:37px;padding:0 9px;border:1px solid var(--border-strong);border-radius:6px;outline:0;background:var(--surface);color:var(--text-strong)}.totp-setup{display:grid;gap:12px}.totp-setup img{width:180px;margin:auto;border-radius:6px}.totp-setup p{margin:0;color:var(--text-muted);font-size:10px}.totp-setup details{color:var(--text-muted);font-size:10px}.backup-codes{display:grid;grid-template-columns:repeat(2,1fr);gap:5px;margin-top:9px}.backup-codes code{padding:6px;border-radius:4px;background:var(--canvas);text-align:center}
</style>
