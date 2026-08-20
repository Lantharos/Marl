<script lang="ts">
  import { goto, invalidateAll } from '$app/navigation';
  import AuthShell from '$lib/components/auth/AuthShell.svelte';
  import Button from '$lib/components/Button.svelte';
  import { api } from '$lib/api';
  import { authClient } from '$lib/auth-client';

  let name = $state('');
  let username = $state('');
  let email = $state('');
  let password = $state('');
  let busy = $state(false);
  let error = $state('');
  let emailVerificationRequired = $state(false);
  let awaitingVerification = $state(false);

  $effect(() => { void api<{ emailVerificationRequired: boolean }>('/auth/methods').then((methods) => (emailVerificationRequired = methods.emailVerificationRequired)).catch(() => undefined); });

  async function signUp() {
    busy = true; error = '';
    try {
      const result = await authClient.signUp.email({ name, username, email, password, callbackURL: '/' });
      if (result.error) { error = result.error.message || 'Your account could not be created.'; return; }
      if (emailVerificationRequired) { awaitingVerification = true; return; }
      await invalidateAll();
      await goto('/');
    } catch (cause) {
      error = cause instanceof Error ? cause.message : 'Your account could not be created.';
    } finally {
      busy = false;
    }
  }
</script>

{#snippet footer()}Already have an account? <a class="auth-link" href="/sign-in">Sign in</a>{/snippet}
<AuthShell title="Create your Marl account" description="Choose your profile and sign-in details." {footer}>
  {#if awaitingVerification}<div class="auth-form"><p>We sent a verification link to <strong>{email}</strong>. Verify the address before signing in.</p><a class="auth-submit" href="/sign-in">Back to sign in</a></div>{:else}<form class="auth-form" onsubmit={(event) => { event.preventDefault(); void signUp(); }}>
    {#if error}<p class="auth-error">{error}</p>{/if}
    <label class="auth-field"><span>Name</span><input autocomplete="name" bind:value={name} required /></label>
    <label class="auth-field"><span>Username</span><input autocomplete="username" minlength="2" maxlength="39" pattern="[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?" bind:value={username} oninput={() => (username = username.toLowerCase())} required /><small>Letters, numbers, dots, dashes, and underscores.</small></label>
    <label class="auth-field"><span>Email</span><input type="email" autocomplete="email" bind:value={email} required /></label>
    <label class="auth-field"><span>Password</span><input type="password" autocomplete="new-password" minlength="12" bind:value={password} required /><small>At least 12 characters.</small></label>
    <Button type="submit" variant="primary" size="large" block loading={busy}>Create account</Button>
  </form>{/if}
</AuthShell>
