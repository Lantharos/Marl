<script lang="ts">
  import Check from '@lucide/svelte/icons/check';
  import ChevronDown from '@lucide/svelte/icons/chevron-down';
  import KeyRound from '@lucide/svelte/icons/key-round';
  import QrCode from '#lib/components/auth/QrCode.svelte';
  import Modal from '#lib/components/overlays/Modal.svelte';
  import Button from '#lib/components/controls/Button.svelte';
  import Field from '#lib/components/controls/Field.svelte';
  import Notice from '#lib/components/feedback/Notice.svelte';
  import SettingItem from '#lib/components/settings/SettingItem.svelte';
  import SettingsHeader from '#lib/components/settings/SettingsHeader.svelte';
  import SettingsGroup from '#lib/components/settings/SettingsGroup.svelte';
  import SigningSettings from '#lib/components/settings/panels/SigningSettings.svelte';
  import { authClient } from '#lib/auth-client.js';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
  let twoFactorDialog = $state(false);
  const { twoFactorEnabled: savedTwoFactorEnabled, signingMode } = $derived(data);
  let twoFactorEnabled = $derived(savedTwoFactorEnabled);
  let disablingTwoFactor = $state(false);
  let twoFactorConfirmed = $state(false);
  let twoFactorPassword = $state('');
  let twoFactorCode = $state('');
  let totpUri = $state('');
  let backupCodes = $state<string[]>([]);
  let backupCodesOpen = $state(false);
  let busy = $state('');
  let passkeyState = $state<'idle' | 'saving' | 'saved'>('idle');
  let error = $state('');

  async function addPasskey() {
    busy = 'passkey';
    passkeyState = 'saving';
    error = '';
    const result = await authClient.passkey.addPasskey({ name: 'Marl passkey' });
    busy = '';
    if (result.error) {
      passkeyState = 'idle';
      error = result.error.message || 'The passkey could not be added.';
      return;
    }
    passkeyState = 'saved';
    setTimeout(() => (passkeyState = 'idle'), 1800);
  }

  async function beginTwoFactor() {
    busy = 'two-factor';
    error = '';
    const result = await authClient.twoFactor.enable({ password: twoFactorPassword, method: 'totp' });
    busy = '';
    if (result.error) {
      error = result.error.message || 'Two-factor authentication could not be enabled.';
      return;
    }
    if (result.data.method !== 'totp') {
      error = 'Two-factor setup returned an unexpected verification method.';
      return;
    }
    totpUri = result.data.totpURI;
    backupCodes = result.data.backupCodes;
  }

  async function confirmTwoFactor() {
    busy = 'two-factor';
    error = '';
    const result = await authClient.twoFactor.verifyTotp({ code: twoFactorCode });
    busy = '';
    if (result.error) {
      error = result.error.message || 'That authentication code is not valid.';
      return;
    }
    twoFactorEnabled = true;
    twoFactorConfirmed = true;
    backupCodesOpen = true;
  }

  async function disableTwoFactor() {
    busy = 'two-factor';
    error = '';
    const result = await authClient.twoFactor.disable({ password: twoFactorPassword });
    busy = '';
    if (result.error) {
      error = result.error.message || 'Two-factor authentication could not be disabled.';
      return;
    }
    twoFactorEnabled = false;
    twoFactorDialog = false;
    twoFactorPassword = '';
  }
</script>

<svelte:head><title>Sign-in and security · Marl</title></svelte:head>
<SettingsHeader title="Sign-in and security" />
{#if error && !twoFactorDialog}<Notice class="mb-4">{error}</Notice>{/if}
<SettingsGroup>
  <SettingItem title="Passkeys" description="Use your device or security key without entering a password.">
    <Button size="small" loading={passkeyState === 'saving'} onclick={addPasskey} disabled={passkeyState !== 'idle'}
      >{#if passkeyState === 'saved'}<Check size={15} />Added{:else if passkeyState === 'idle'}<KeyRound size={15} />Add
        passkey{:else}Adding{/if}</Button
    >
  </SettingItem>
  <SettingItem
    title="Two-factor authentication"
    description={twoFactorEnabled ? 'Enabled with an authenticator app' : 'Not set up'}
  >
    <Button
      size="small"
      variant={twoFactorEnabled ? 'danger-soft' : 'secondary'}
      onclick={() => {
        disablingTwoFactor = twoFactorEnabled;
        twoFactorConfirmed = false;
        twoFactorDialog = true;
        twoFactorPassword = '';
        twoFactorCode = '';
        totpUri = '';
        backupCodes = [];
        backupCodesOpen = false;
        error = '';
      }}>{twoFactorEnabled ? 'Disable' : 'Set up'}</Button
    >
  </SettingItem>
  <SigningSettings endpoint="/signing" initialMode={signingMode} personal />
</SettingsGroup>

{#snippet twoFactorActions()}
  {#if disablingTwoFactor}
    <Button size="small" onclick={() => (twoFactorDialog = false)}>Cancel</Button>
    <Button
      size="small"
      variant="danger"
      loading={busy === 'two-factor'}
      disabled={!twoFactorPassword}
      onclick={disableTwoFactor}>Disable two-factor</Button
    >
  {:else if twoFactorConfirmed}
    <Button size="small" variant="primary" onclick={() => (twoFactorDialog = false)}>Done</Button>
  {:else if !totpUri}
    <Button size="small" onclick={() => (twoFactorDialog = false)}>Cancel</Button>
    <Button
      size="small"
      variant="primary"
      loading={busy === 'two-factor'}
      disabled={!twoFactorPassword}
      onclick={beginTwoFactor}>Continue</Button
    >
  {:else}
    <Button
      size="small"
      variant="primary"
      loading={busy === 'two-factor'}
      disabled={twoFactorCode.length !== 6}
      onclick={confirmTwoFactor}>Verify and enable</Button
    >
  {/if}
{/snippet}
<Modal
  open={twoFactorDialog}
  title={disablingTwoFactor ? 'Disable two-factor authentication?' : 'Set up two-factor authentication'}
  description={disablingTwoFactor
    ? 'Your account will return to password and passkey protection.'
    : totpUri
      ? undefined
      : 'Enter your Marl password before changing account security.'}
  size="small"
  onClose={() => (twoFactorDialog = false)}
  actions={twoFactorActions}
>
  <div class="grid gap-4">
    {#if disablingTwoFactor || !totpUri}
      <Field label="Password">
        <input class="field" type="password" autocomplete="current-password" bind:value={twoFactorPassword} />
      </Field>
    {:else}
      <QrCode value={totpUri} label="Authenticator setup QR code" />
      <p class="text-sm text-ink-muted">
        {twoFactorConfirmed
          ? 'Two-factor authentication is active. Save these recovery codes now.'
          : 'Scan this with your authenticator, then enter the six-digit code.'}
      </p>
      {#if !twoFactorConfirmed}
        <Field label="Authentication code">
          <input
            class="field text-center font-mono tracking-[0.4em]"
            inputmode="numeric"
            maxlength="6"
            autocomplete="one-time-code"
            bind:value={twoFactorCode}
          />
        </Field>
      {/if}
      <div>
        <Button
          size="small"
          variant="ghost"
          class="-ml-2.5"
          aria-expanded={backupCodesOpen}
          aria-controls="recovery-codes"
          onclick={() => (backupCodesOpen = !backupCodesOpen)}>Recovery codes<ChevronDown size={14} /></Button
        >
        {#if backupCodesOpen}
          <div id="recovery-codes" class="mt-2 grid grid-cols-2 gap-1.5 text-ink-muted">
            {#each backupCodes as code (code)}<code class="rounded-md bg-canvas p-1.5 text-center font-mono text-xs"
                >{code}</code
              >{/each}
          </div>
        {/if}
      </div>
    {/if}
    {#if error}<Notice>{error}</Notice>{/if}
  </div>
</Modal>
