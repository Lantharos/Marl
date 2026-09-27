<script lang="ts">
  import { page } from '$app/state';
  import { onMount } from 'svelte';
  import BadgeCheck from '@lucide/svelte/icons/badge-check';
  import CircleAlert from '@lucide/svelte/icons/circle-alert';
  import LoaderCircle from '@lucide/svelte/icons/loader-circle';
  import { api, MarlApiError } from '$lib/api';

  let verificationState = $state<'verifying' | 'verified' | 'error'>('verifying');
  let detail = $state('Verifying your email address…');

  onMount(async () => {
    const token = page.url.searchParams.get('token');
    if (!token) {
      verificationState = 'error';
      detail = 'This verification link is incomplete.';
      return;
    }
    try {
      await api('/emails/verify', { method: 'POST', body: JSON.stringify({ token }) });
      verificationState = 'verified';
      detail = 'Commits authored with this email now link to your Marl profile.';
    } catch (cause) {
      verificationState = 'error';
      detail = cause instanceof MarlApiError ? cause.message : 'The email could not be verified.';
    }
  });
</script>

<svelte:head><title>Verify email · Marl</title></svelte:head>
<div class="grid min-h-105 place-content-center justify-items-center text-center text-ink-muted">
  {#if verificationState === 'verifying'}<LoaderCircle
      size={26}
      class="animate-spin text-brand"
    />{:else if verificationState === 'verified'}<BadgeCheck size={26} class="text-success" />{:else}<CircleAlert
      size={26}
      class="text-danger"
    />{/if}
  <h1 class="mt-3.5 text-xl font-semibold text-ink-strong">
    {verificationState === 'verifying'
      ? 'Verifying email'
      : verificationState === 'verified'
        ? 'Email verified'
        : 'Verification failed'}
  </h1>
  <p class="mt-2 mb-4 max-w-108 text-sm leading-relaxed">{detail}</p>
  {#if verificationState !== 'verifying'}<a
      class="text-sm font-medium text-brand hover:underline"
      href="/settings/account/emails">Back to emails</a
    >{/if}
</div>
