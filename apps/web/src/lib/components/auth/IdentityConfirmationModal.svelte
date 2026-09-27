<script lang="ts">
  import KeyRound from '@lucide/svelte/icons/key-round';
  import ShieldCheck from '@lucide/svelte/icons/shield-check';
  import Button from '../controls/Button.svelte';
  import Field from '../controls/Field.svelte';
  import Notice from '../feedback/Notice.svelte';
  import Modal from '../overlays/Modal.svelte';

  type Method = 'passkey' | 'totp' | 'password';
  let {
    open,
    method,
    description = 'Confirm this sensitive account change before continuing.',
    onClose,
    onVerified
  }: {
    open: boolean;
    method: Method | null;
    description?: string;
    onClose: () => void;
    onVerified: () => void | Promise<void>;
  } = $props();
  let value = $state('');
  let busy = $state(false);
  let error = $state('');

  function close() {
    if (busy) return;
    value = '';
    error = '';
    onClose();
  }

  async function verify() {
    if (!method || busy || (method !== 'passkey' && !value)) return;
    busy = true;
    error = '';
    try {
      if (method === 'passkey') {
        const { authClient } = await import('$lib/auth-client');
        const result = await authClient.signIn.passkey();
        if (result.error) throw new Error(result.error.message || 'The passkey could not be verified.');
      } else {
        const response = await fetch('/api/auth/step-up/verify', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ method, value })
        });
        if (!response.ok) {
          const result = (await response.json().catch(() => null)) as { message?: string } | null;
          throw new Error(result?.message || 'Your identity could not be confirmed.');
        }
      }
      value = '';
      await onVerified();
      onClose();
    } catch (cause) {
      error = cause instanceof Error ? cause.message : 'Your identity could not be confirmed.';
    } finally {
      busy = false;
    }
  }
</script>

{#snippet actions()}
  <Button size="small" onclick={close} disabled={busy}>Cancel</Button>
  <Button
    size="small"
    variant="primary"
    loading={busy}
    disabled={!method || (method !== 'passkey' && !value)}
    onclick={verify}
  >
    {method === 'passkey' ? 'Use passkey' : 'Confirm identity'}
  </Button>
{/snippet}

<Modal {open} title="Confirm your identity" {description} size="small" onClose={close} {actions}>
  <div class="grid gap-3.5">
    {#if method === 'passkey' || !method}
      <div class="flex items-center gap-3 rounded-lg bg-surface p-3.5 text-ink-muted">
        {#if method === 'passkey'}<KeyRound size={19} class="shrink-0 text-brand" />
          <div>
            <strong class="block text-sm font-semibold text-ink-strong">Use your passkey</strong>
            <p class="mt-1 text-sm">Continue with your device, fingerprint, face, or security key.</p>
          </div>{:else}<ShieldCheck size={19} class="shrink-0 text-brand" /><span class="text-sm"
            >Checking your account security…</span
          >{/if}
      </div>
    {:else}
      <Field label={method === 'totp' ? 'Authentication code' : 'Password'}>
        {#if method === 'totp'}<input
            class="field font-mono tracking-widest"
            inputmode="numeric"
            maxlength="6"
            autocomplete="one-time-code"
            bind:value
            onkeydown={(event) => event.key === 'Enter' && void verify()}
          />{:else}<input
            class="field"
            type="password"
            autocomplete="current-password"
            bind:value
            onkeydown={(event) => event.key === 'Enter' && void verify()}
          />{/if}
      </Field>
    {/if}
    {#if error}<Notice>{error}</Notice>{/if}
  </div>
</Modal>
