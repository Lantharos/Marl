<script lang="ts">
  import { goto, invalidateAll } from '$app/navigation';
  import AuthShell from '$lib/components/auth/AuthShell.svelte';
  import Button from '$lib/components/controls/Button.svelte';
  import LinkButton from '$lib/components/controls/LinkButton.svelte';
  import Field from '$lib/components/controls/Field.svelte';
  import Notice from '$lib/components/feedback/Notice.svelte';
  import { legalVersion } from '@marl/contracts';
  import Checkbox from '$lib/components/controls/Checkbox.svelte';
  import { authClient } from '$lib/auth-client';
  import { clearShellCache } from '$lib/shell-cache';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
  let name = $state('');
  let username = $state('');
  let email = $state('');
  let password = $state('');
  let accepted = $state(false);
  let busy = $state(false);
  let error = $state('');
  let awaitingVerification = $state(false);

  async function signUp() {
    busy = true;
    error = '';
    try {
      const result = await authClient.signUp.email({
        name,
        username,
        email,
        password,
        termsVersion: legalVersion,
        callbackURL: '/'
      } as Parameters<typeof authClient.signUp.email>[0]);
      if (result.error) {
        error = result.error.message || 'Your account could not be created.';
        return;
      }
      clearShellCache(true);
      if (data.emailVerificationRequired) {
        awaitingVerification = true;
        return;
      }
      await invalidateAll();
      await goto('/');
    } catch (cause) {
      error = cause instanceof Error ? cause.message : 'Your account could not be created.';
    } finally {
      busy = false;
    }
  }
</script>

{#snippet footer()}Already have an account? <a class="font-semibold text-brand-strong hover:underline" href="/sign-in"
    >Sign in</a
  >{/snippet}
<AuthShell title="Create your Marl account" description="Choose your profile and sign-in details." {footer}>
  {#if awaitingVerification}
    <div class="grid gap-5">
      <Notice tone="success"
        >We sent a verification link to <strong>{email}</strong>. Verify the address before signing in.</Notice
      >
      <LinkButton variant="primary" size="large" block href="/sign-in">Back to sign in</LinkButton>
    </div>
  {:else}
    <form
      class="grid gap-5"
      onsubmit={(event) => {
        event.preventDefault();
        void signUp();
      }}
    >
      {#if error}<Notice>{error}</Notice>{/if}
      <Field label="Name"><input class="h-11 field" autocomplete="name" bind:value={name} required /></Field>
      <Field label="Username" hint="Letters, numbers, dots, dashes, and underscores.">
        <input
          class="h-11 field"
          autocomplete="username"
          minlength="2"
          maxlength="39"
          pattern="[a-z0-9](?:(?:[a-z0-9._]|-)*[a-z0-9])?"
          bind:value={username}
          oninput={() => (username = username.toLowerCase())}
          required
        />
      </Field>
      <Field label="Email"
        ><input class="h-11 field" type="email" autocomplete="email" bind:value={email} required /></Field
      >
      <Field label="Password" hint="At least 12 characters.">
        <input
          class="h-11 field"
          type="password"
          autocomplete="new-password"
          minlength="12"
          bind:value={password}
          required
        />
      </Field>
      <div class="-mx-2.5 grid gap-1">
        <Checkbox bind:checked={accepted} label="I agree to Marl’s terms and policies" />
        <p class="pl-10 text-xs leading-relaxed text-ink-muted">
          Read the <a class="font-semibold text-brand-strong hover:underline" href="/legal/terms" target="_blank"
            >Terms of Service</a
          >,
          <a class="font-semibold text-brand-strong hover:underline" href="/legal/privacy" target="_blank"
            >Privacy Policy</a
          >, and
          <a class="font-semibold text-brand-strong hover:underline" href="/legal/acceptable-use" target="_blank"
            >Acceptable Use Policy</a
          >.
        </p>
      </div>
      <Button type="submit" variant="primary" size="large" block loading={busy} disabled={!accepted}
        >Create account</Button
      >
    </form>
  {/if}
</AuthShell>
