<script lang="ts">
  import { page } from '$app/stores';
  import AuthShell from '$lib/components/AuthShell.svelte';
  import Button from '$lib/components/Button.svelte';
  import { authClient } from '$lib/auth-client';
  let password = $state(''); let confirm = $state(''); let busy = $state(false); let complete = $state(false); let error = $state('');
  async function reset() { if (password !== confirm) { error = 'Passwords do not match.'; return; } const token = $page.url.searchParams.get('token'); if (!token) { error = 'This recovery link is invalid or expired.'; return; } busy = true; const result = await authClient.resetPassword({ newPassword: password, token }); busy = false; if (result.error) error = result.error.message || 'Your password could not be reset.'; else complete = true; }
</script>
{#snippet footer()}{#if complete}<a class="auth-link" href="/sign-in">Sign in with the new password</a>{/if}{/snippet}
<AuthShell title={complete ? 'Password updated' : 'Choose a new password'} description={complete ? 'Your old password can no longer be used.' : 'Use at least 12 characters and do not reuse a password from another service.'} {footer}>{#if !complete}<form class="auth-form" onsubmit={(event) => { event.preventDefault(); void reset(); }}>{#if error}<p class="auth-error">{error}</p>{/if}<label class="auth-field"><span>New password</span><input type="password" autocomplete="new-password" minlength="12" bind:value={password} required /></label><label class="auth-field"><span>Confirm password</span><input type="password" autocomplete="new-password" minlength="12" bind:value={confirm} required /></label><Button variant="primary" size="large" block disabled={busy}>Update password</Button></form>{/if}</AuthShell>
