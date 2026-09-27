<script lang="ts">
  import { goto, invalidateAll } from '$app/navigation';
  import { page } from '$app/state';
  import AuthShell from '$lib/components/auth/AuthShell.svelte';
  import Button from '$lib/components/controls/Button.svelte';
  import Field from '$lib/components/controls/Field.svelte';
  import Notice from '$lib/components/feedback/Notice.svelte';
  import { authClient } from '$lib/auth-client';
  import { clearShellCache } from '$lib/shell-cache';

  let code = $state('');
  let error = $state('');
  let busy = $state(false);
  const requestedReturnTo = $derived(page.url.searchParams.get('returnTo'));
  const returnTo = $derived(
    requestedReturnTo?.startsWith('/') && !requestedReturnTo.startsWith('//') ? requestedReturnTo : '/'
  );
  async function verify() {
    busy = true;
    error = '';
    try {
      const result = await authClient.twoFactor.verifyTotp({ code, trustDevice: true });
      if (result.error) {
        error = result.error.message || 'That code is not valid.';
        return;
      }
      clearShellCache(true);
      await invalidateAll();
      await goto(returnTo);
    } catch (cause) {
      error = cause instanceof Error ? cause.message : 'That code is not valid.';
    } finally {
      busy = false;
    }
  }
</script>

<AuthShell title="Two-factor authentication" description="Enter the current six-digit code from your authenticator.">
  <form
    class="grid gap-5"
    onsubmit={(event) => {
      event.preventDefault();
      void verify();
    }}
  >
    {#if error}<Notice>{error}</Notice>{/if}
    <Field label="Authentication code">
      <input
        class="h-12 field text-center font-mono text-lg tracking-[0.4em]"
        inputmode="numeric"
        autocomplete="one-time-code"
        maxlength="6"
        bind:value={code}
        required
      />
    </Field>
    <Button type="submit" variant="primary" size="large" block loading={busy} disabled={code.length !== 6}
      >Verify</Button
    >
  </form>
</AuthShell>
