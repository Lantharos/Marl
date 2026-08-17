<script lang="ts">
  import { goto, invalidateAll } from '$app/navigation';
  import AuthShell from '$lib/components/AuthShell.svelte';
  import { authClient } from '$lib/auth-client';

  let code = $state('');
  let error = $state('');
  let busy = $state(false);
  async function verify() {
    busy = true; error = '';
    const result = await authClient.twoFactor.verifyTotp({ code, trustDevice: true });
    busy = false;
    if (result.error) { error = result.error.message || 'That code is not valid.'; return; }
    await invalidateAll(); await goto('/');
  }
</script>

<AuthShell title="Two-factor authentication" description="Enter the current six-digit code from your authenticator."><form class="auth-form" onsubmit={(event) => { event.preventDefault(); void verify(); }}>{#if error}<p class="auth-error">{error}</p>{/if}<label class="auth-field"><span>Authentication code</span><input inputmode="numeric" autocomplete="one-time-code" maxlength="6" bind:value={code} required /></label><button class="auth-submit" disabled={busy || code.length !== 6}>Verify</button></form></AuthShell>
