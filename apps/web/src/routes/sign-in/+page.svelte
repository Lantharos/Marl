<script lang="ts">
  import { goto, invalidateAll } from '$app/navigation';
  import { page } from '$app/stores';
  import KeyRound from 'lucide-svelte/icons/key-round';
  import AuthShell from '$lib/components/auth/AuthShell.svelte';
  import Button from '$lib/components/Button.svelte';
  import { authClient } from '$lib/auth-client';
  import { api } from '$lib/api';

  let identity = $state('');
  let password = $state('');
  let busy = $state(false);
  let error = $state('');
  let methods = $state({ ave: false, passkey: true });
  const requestedReturnTo = $derived($page.url.searchParams.get('returnTo'));
  const returnTo = $derived(requestedReturnTo?.startsWith('/') && !requestedReturnTo.startsWith('//') ? requestedReturnTo : '/');

  $effect(() => { void api<{ ave: boolean; passkey: boolean }>('/auth/methods').then((value) => (methods = value)).catch(() => undefined); });

  async function finish() {
    await invalidateAll();
    await goto(returnTo);
  }

  async function signIn() {
    busy = true; error = '';
    try {
      const result = identity.includes('@')
        ? await authClient.signIn.email({ email: identity, password, callbackURL: returnTo })
        : await authClient.signIn.username({ username: identity, password, callbackURL: returnTo });
      if (result.error) { error = result.error.message || 'Sign in failed.'; return; }
      await finish();
    } catch (cause) {
      error = cause instanceof Error ? cause.message : 'Sign in failed.';
    } finally {
      busy = false;
    }
  }

  async function usePasskey() {
    busy = true; error = '';
    const result = await authClient.signIn.passkey();
    busy = false;
    if (result.error) { error = result.error.message || 'That passkey could not be used.'; return; }
    await finish();
  }

  async function useAve() {
    error = '';
    const result = await authClient.signIn.oauth2({ providerId: 'ave', callbackURL: returnTo });
    if (result.error) error = result.error.message || 'Ave sign in could not be started.';
  }
</script>

{#snippet footer()}New to Marl? <a class="auth-link" href="/sign-up">Create an account</a>{/snippet}
<AuthShell title="Sign in to Marl" description="Continue to your repositories and reviews." {footer}>
  <form class="auth-form" onsubmit={(event) => { event.preventDefault(); void signIn(); }}>
    {#if error}<p class="auth-error">{error}</p>{/if}
    <label class="auth-field"><span>Email or username</span><input autocomplete="username" bind:value={identity} required /></label>
    <label class="auth-field"><span>Password</span><input type="password" autocomplete="current-password" bind:value={password} required /></label><a class="auth-link recovery" href="/forgot-password">Forgot password?</a>
    <Button type="submit" variant="primary" size="large" block loading={busy}>Sign in</Button>
    {#if methods.passkey}<div class="auth-divider">or</div><Button size="large" block disabled={busy} onclick={usePasskey}><KeyRound size={15} />Use a passkey</Button>{/if}
    {#if methods.ave}<Button size="large" block disabled={busy} onclick={useAve}>Continue with Ave</Button>{/if}
  </form>
</AuthShell>

<style>.recovery{justify-self:end;margin-top:-7px;font-size:9px}</style>
