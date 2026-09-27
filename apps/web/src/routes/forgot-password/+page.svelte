<script lang="ts">
  import AuthShell from '$lib/components/auth/AuthShell.svelte';
  import Button from '$lib/components/controls/Button.svelte';
  import Field from '$lib/components/controls/Field.svelte';
  import Notice from '$lib/components/feedback/Notice.svelte';
  import { authClient } from '$lib/auth-client';
  let email = $state('');
  let busy = $state(false);
  let sent = $state(false);
  let error = $state('');
  async function requestReset() {
    busy = true;
    error = '';
    try {
      const result = await authClient.requestPasswordReset({ email, redirectTo: '/reset-password' });
      if (result.error) error = result.error.message || 'The reset email could not be sent.';
      else sent = true;
    } catch (cause) {
      error = cause instanceof Error ? cause.message : 'The reset email could not be sent.';
    } finally {
      busy = false;
    }
  }
</script>

{#snippet footer()}<a class="font-semibold text-brand-strong hover:underline" href="/sign-in">Back to sign in</a
  >{/snippet}
<AuthShell
  title="Reset your password"
  description={sent
    ? 'If that address belongs to an account, a reset link is on its way.'
    : 'Marl will send a single-use recovery link to your verified email address.'}
  {footer}
>
  {#if !sent}
    <form
      class="grid gap-5"
      onsubmit={(event) => {
        event.preventDefault();
        void requestReset();
      }}
    >
      {#if error}<Notice>{error}</Notice>{/if}
      <Field label="Email"
        ><input class="h-11 field" type="email" autocomplete="email" bind:value={email} required /></Field
      >
      <Button type="submit" variant="primary" size="large" block loading={busy}>Send reset link</Button>
    </form>
  {/if}
</AuthShell>
