<script lang="ts">
  import AuthShell from '$lib/components/AuthShell.svelte';
  import Button from '$lib/components/Button.svelte';
  import { authClient } from '$lib/auth-client';
  let email = $state(''); let busy = $state(false); let sent = $state(false); let error = $state('');
  async function requestReset() { busy = true; error = ''; const result = await authClient.requestPasswordReset({ email, redirectTo: '/reset-password' }); busy = false; if (result.error) error = result.error.message || 'The reset email could not be sent.'; else sent = true; }
</script>
{#snippet footer()}<a class="auth-link" href="/sign-in">Back to sign in</a>{/snippet}
<AuthShell title="Reset your password" description={sent ? 'If that address belongs to an account, a reset link is on its way.' : 'Marl will send a single-use recovery link to your verified email address.'} {footer}>{#if !sent}<form class="auth-form" onsubmit={(event) => { event.preventDefault(); void requestReset(); }}>{#if error}<p class="auth-error">{error}</p>{/if}<label class="auth-field"><span>Email</span><input type="email" autocomplete="email" bind:value={email} required /></label><Button variant="primary" size="large" block disabled={busy}>Send reset link</Button></form>{/if}</AuthShell>
