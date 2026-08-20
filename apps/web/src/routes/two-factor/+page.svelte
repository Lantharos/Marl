<script lang="ts">
  import { goto, invalidateAll } from '$app/navigation';
  import { page } from '$app/stores';
  import AuthShell from '$lib/components/auth/AuthShell.svelte';
  import Button from '$lib/components/Button.svelte';
  import { authClient } from '$lib/auth-client';

  let code = $state('');
  let error = $state('');
  let busy = $state(false);
  const requestedReturnTo = $derived($page.url.searchParams.get('returnTo'));
  const returnTo = $derived(requestedReturnTo?.startsWith('/') && !requestedReturnTo.startsWith('//') ? requestedReturnTo : '/');
  async function verify() {
    busy = true; error = '';
    try {
      const result = await authClient.twoFactor.verifyTotp({ code, trustDevice: true });
      if (result.error) { error = result.error.message || 'That code is not valid.'; return; }
      await invalidateAll(); await goto(returnTo);
    } catch (cause) {
      error = cause instanceof Error ? cause.message : 'That code is not valid.';
    } finally {
      busy = false;
    }
  }
</script>

<AuthShell title="Two-factor authentication" description="Enter the current six-digit code from your authenticator."><form class="auth-form" onsubmit={(event) => { event.preventDefault(); void verify(); }}>{#if error}<p class="auth-error">{error}</p>{/if}<label class="auth-field"><span>Authentication code</span><input inputmode="numeric" autocomplete="one-time-code" maxlength="6" bind:value={code} required /></label><Button type="submit" variant="primary" size="large" block loading={busy} disabled={code.length !== 6}>Verify</Button></form></AuthShell>
