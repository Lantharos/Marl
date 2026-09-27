<script lang="ts">
  import { page } from '$app/state';
  import AuthShell from '$lib/components/auth/AuthShell.svelte';
  import Button from '$lib/components/controls/Button.svelte';
  import Field from '$lib/components/controls/Field.svelte';
  import Notice from '$lib/components/feedback/Notice.svelte';
  import { authClient } from '$lib/auth-client';
  let password = $state('');
  let confirm = $state('');
  let busy = $state(false);
  let complete = $state(false);
  let error = $state('');
  async function reset() {
    if (password !== confirm) {
      error = 'Passwords do not match.';
      return;
    }
    const token = page.url.searchParams.get('token');
    if (!token) {
      error = 'This recovery link is invalid or expired.';
      return;
    }
    busy = true;
    error = '';
    try {
      const result = await authClient.resetPassword({ newPassword: password, token });
      if (result.error) error = result.error.message || 'Your password could not be reset.';
      else complete = true;
    } catch (cause) {
      error = cause instanceof Error ? cause.message : 'Your password could not be reset.';
    } finally {
      busy = false;
    }
  }
</script>

{#snippet footer()}{#if complete}<a class="font-semibold text-brand-strong hover:underline" href="/sign-in"
      >Sign in with the new password</a
    >{/if}{/snippet}
<AuthShell
  title={complete ? 'Password updated' : 'Choose a new password'}
  description={complete
    ? 'Your old password can no longer be used.'
    : 'Use at least 12 characters and do not reuse a password from another service.'}
  {footer}
>
  {#if !complete}
    <form
      class="grid gap-5"
      onsubmit={(event) => {
        event.preventDefault();
        void reset();
      }}
    >
      {#if error}<Notice>{error}</Notice>{/if}
      <Field label="New password">
        <input
          class="h-11 field"
          type="password"
          autocomplete="new-password"
          minlength="12"
          bind:value={password}
          required
        />
      </Field>
      <Field label="Confirm password">
        <input
          class="h-11 field"
          type="password"
          autocomplete="new-password"
          minlength="12"
          bind:value={confirm}
          required
        />
      </Field>
      <Button type="submit" variant="primary" size="large" block loading={busy}>Update password</Button>
    </form>
  {/if}
</AuthShell>
