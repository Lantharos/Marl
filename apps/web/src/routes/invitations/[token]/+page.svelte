<script lang="ts">
  import { page } from '$app/state';
  import CheckCircle2 from '@lucide/svelte/icons/circle-check-big';
  import AuthShell from '$lib/components/auth/AuthShell.svelte';
  import Button from '$lib/components/controls/Button.svelte';
  import LinkButton from '$lib/components/controls/LinkButton.svelte';
  import Notice from '$lib/components/feedback/Notice.svelte';
  import { api, MarlApiError } from '$lib/api';

  let busy = $state(false);
  let organization = $state<{ slug: string; name: string } | null>(null);
  let error = $state('');
  let needsSignIn = $state(false);

  async function accept() {
    busy = true;
    error = '';
    needsSignIn = false;
    try {
      organization = (
        await api<{ organization: { slug: string; name: string } }>(`/invitations/${page.params.token}/accept`, {
          method: 'POST'
        })
      ).organization;
    } catch (cause) {
      if (cause instanceof MarlApiError && cause.status === 401) needsSignIn = true;
      else error = cause instanceof MarlApiError ? cause.message : 'The invitation could not be accepted.';
    } finally {
      busy = false;
    }
  }
</script>

<AuthShell
  title={organization ? `Welcome to ${organization.name}` : 'Join an organization'}
  description={organization
    ? 'Your membership is active.'
    : 'Accept this invitation with the exact email address it was sent to.'}
>
  <div class="grid gap-4">
    {#if organization}
      <CheckCircle2 size={28} class="justify-self-center text-success" />
      <LinkButton block variant="primary" size="large" href={`/organizations/${organization.slug}/settings/access`}
        >Open {organization.name}</LinkButton
      >
    {:else}
      {#if error}<Notice>{error}</Notice>{/if}
      {#if needsSignIn}<LinkButton
          block
          variant="primary"
          size="large"
          href={`/sign-in?returnTo=${encodeURIComponent(page.url.pathname)}`}>Sign in to continue</LinkButton
        >{:else}<Button block variant="primary" size="large" loading={busy} onclick={accept}>Accept invitation</Button
        >{/if}
    {/if}
  </div>
</AuthShell>
