<script lang="ts">
  import KeyRound from 'lucide-svelte/icons/key-round';
  import ShieldCheck from 'lucide-svelte/icons/shield-check';
  import Button from './Button.svelte';
  import Modal from './Modal.svelte';
  import { authClient } from '$lib/auth-client';

  type Method = 'passkey' | 'totp' | 'password';
  let { open, method, onClose, onVerified } = $props<{
    open: boolean;
    method: Method | null;
    onClose: () => void;
    onVerified: () => void | Promise<void>;
  }>();
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
        const result = await authClient.signIn.passkey();
        if (result.error) throw new Error(result.error.message || 'The passkey could not be verified.');
      } else {
        const response = await fetch('/api/auth/step-up/verify', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ method, value })
        });
        if (!response.ok) {
          const result = await response.json().catch(() => null) as { message?: string } | null;
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
  <Button size="small" variant="primary" disabled={busy || !method || (method !== 'passkey' && !value)} onclick={verify}>
    {busy ? 'Confirming…' : method === 'passkey' ? 'Use passkey' : 'Confirm identity'}
  </Button>
{/snippet}

<Modal {open} title="Confirm your identity" description="This protects changes to the keys trusted by your account." onClose={close} {actions}>
  <div class="confirmation">
    {#if method === 'passkey'}
      <div class="passkey"><KeyRound size={19} /><div><strong>Use your passkey</strong><p>Continue with your device, fingerprint, face, or security key.</p></div></div>
    {:else if method === 'totp'}
      <label><span>Authentication code</span><input inputmode="numeric" maxlength="6" autocomplete="one-time-code" bind:value onkeydown={(event) => event.key === 'Enter' && void verify()} /></label>
    {:else if method === 'password'}
      <label><span>Password</span><input type="password" autocomplete="current-password" bind:value onkeydown={(event) => event.key === 'Enter' && void verify()} /></label>
    {:else}
      <div class="loading"><ShieldCheck size={19} />Checking your account security…</div>
    {/if}
    {#if error}<p class="error" role="alert">{error}</p>{/if}
  </div>
</Modal>

<style>
  .confirmation{display:grid;gap:13px}.passkey,.loading{display:flex;align-items:center;gap:11px;padding:11px;border-radius:7px;background:var(--surface);color:var(--text-muted)}.passkey>:global(svg),.loading>:global(svg){flex:0 0 auto;color:var(--brand)}.passkey strong{display:block;color:var(--text-strong);font-size:11px}.passkey p{margin:4px 0 0;color:var(--text-muted);font-size:10px;line-height:1.45}.loading{font-size:10px}label{display:grid;gap:8px}label span{color:var(--text-strong);font-size:10px;font-weight:630}input{height:37px;padding:0 9px;border:1px solid var(--border-strong);border-radius:6px;outline:0;background:var(--surface);color:var(--text-strong);font:inherit;font-size:12px}input:focus{border-color:var(--brand)}.error{margin:0;padding:9px 10px;border-radius:6px;background:var(--danger-soft);color:var(--danger);font-size:10px}
</style>
