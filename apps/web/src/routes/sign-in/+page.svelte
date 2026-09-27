<script lang="ts">
  import { goto, invalidateAll } from '$app/navigation';
  import { page } from '$app/state';
  import KeyRound from '@lucide/svelte/icons/key-round';
  import AuthShell from '$lib/components/auth/AuthShell.svelte';
  import Button from '$lib/components/controls/Button.svelte';
  import Field from '$lib/components/controls/Field.svelte';
  import Notice from '$lib/components/feedback/Notice.svelte';
  import { authClient } from '$lib/auth-client';
  import { clearShellCache } from '$lib/shell-cache';

  let identity = $state('');
  let password = $state('');
  let busy = $state(false);
  let error = $state('');
  const requestedReturnTo = $derived(page.url.searchParams.get('returnTo'));
  const returnTo = $derived(
    requestedReturnTo?.startsWith('/') && !requestedReturnTo.startsWith('//') ? requestedReturnTo : '/'
  );

  async function finish() {
    clearShellCache(true);
    await invalidateAll();
    await goto(returnTo);
  }

  async function signIn() {
    busy = true;
    error = '';
    try {
      const result = identity.includes('@')
        ? await authClient.signIn.email({ email: identity, password })
        : await authClient.signIn.username({ username: identity, password });
      if (result.error) {
        error = result.error.message || 'Sign in failed.';
        return;
      }
      if (result.data && 'twoFactorRedirect' in result.data && result.data.twoFactorRedirect) {
        await goto(`/two-factor?returnTo=${encodeURIComponent(returnTo)}`);
        return;
      }
      await finish();
    } catch (cause) {
      error = cause instanceof Error ? cause.message : 'Sign in failed.';
    } finally {
      busy = false;
    }
  }

  async function usePasskey() {
    busy = true;
    error = '';
    const result = await authClient.signIn.passkey();
    busy = false;
    if (result.error) {
      error = result.error.message || 'That passkey could not be used.';
      return;
    }
    await finish();
  }
</script>

{#snippet footer()}New to Marl? <a class="font-semibold text-brand-strong hover:underline" href="/sign-up"
    >Create an account</a
  >{/snippet}
<AuthShell title="Sign in to Marl" description="Continue to your repositories and reviews." {footer}>
  <form
    class="grid gap-5"
    onsubmit={(event) => {
      event.preventDefault();
      void signIn();
    }}
  >
    {#if error}<Notice>{error}</Notice>{/if}
    <Field label="Email or username">
      <input class="h-11 field" autocomplete="username" bind:value={identity} required />
    </Field>
    <div class="grid gap-2">
      <Field label="Password">
        <input class="h-11 field" type="password" autocomplete="current-password" bind:value={password} required />
      </Field>
      <a class="justify-self-end text-xs font-medium text-brand-strong hover:underline" href="/forgot-password"
        >Forgot password?</a
      >
    </div>
    <Button type="submit" variant="primary" size="large" block loading={busy}>Sign in</Button>
    <div class="flex items-center gap-3 text-xs text-ink-faint" aria-hidden="true">
      <span class="h-px flex-1 bg-line-subtle"></span>or<span class="h-px flex-1 bg-line-subtle"></span>
    </div>
    <Button size="large" block disabled={busy} onclick={usePasskey}><KeyRound size={16} />Use a passkey</Button>
  </form>
</AuthShell>
