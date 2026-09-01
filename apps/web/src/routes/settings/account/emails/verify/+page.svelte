<script lang="ts">
  import { page } from '$app/stores';
  import { onMount } from 'svelte';
  import BadgeCheck from 'lucide-svelte/icons/badge-check';
  import CircleAlert from 'lucide-svelte/icons/circle-alert';
  import LoaderCircle from 'lucide-svelte/icons/loader-circle';
  import { api, MarlApiError } from '$lib/api';

  let verificationState = $state<'verifying' | 'verified' | 'error'>('verifying');
  let detail = $state('Verifying your email address…');

  onMount(async () => {
    const token = $page.url.searchParams.get('token');
    if (!token) { verificationState = 'error'; detail = 'This verification link is incomplete.'; return; }
    try { await api('/emails/verify', { method: 'POST', body: JSON.stringify({ token }) }); verificationState = 'verified'; detail = 'Commits authored with this email now link to your Marl profile.'; }
    catch (cause) { verificationState = 'error'; detail = cause instanceof MarlApiError ? cause.message : 'The email could not be verified.'; }
  });
</script>

<svelte:head><title>Verify email · Marl</title></svelte:head>
<div class="result">{#if verificationState === 'verifying'}<span class="spin"><LoaderCircle size={25} /></span>{:else if verificationState === 'verified'}<BadgeCheck size={25} />{:else}<CircleAlert size={25} />{/if}<h2>{verificationState === 'verifying' ? 'Verifying email' : verificationState === 'verified' ? 'Email verified' : 'Verification failed'}</h2><p>{detail}</p>{#if verificationState !== 'verifying'}<a href="/settings/account/emails">Back to emails</a>{/if}</div>

<style>.result{display:grid;min-height:420px;place-content:center;justify-items:center;color:var(--text-muted);text-align:center}.result>:global(svg){color:var(--brand)}.result h2{margin:14px 0 0;color:var(--text-strong);font-size:20px}.result p{max-width:430px;margin:7px 0 17px;font-size:12px;line-height:1.55}.result a{color:var(--brand);font-size:12px;text-decoration:none}.spin{display:flex;animation:spin .8s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}</style>
