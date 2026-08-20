<script lang="ts">
  import { page } from '$app/stores';
  import CheckCircle2 from 'lucide-svelte/icons/circle-check-big';
  import AuthShell from '$lib/components/auth/AuthShell.svelte';
  import { api, MarlApiError } from '$lib/api';

  let busy = $state(false);
  let organization = $state<{ slug: string; name: string } | null>(null);
  let error = $state('');
  let needsSignIn = $state(false);

  async function accept() {
    busy = true; error = ''; needsSignIn = false;
    try { organization = (await api<{ organization: { slug: string; name: string } }>(`/invitations/${$page.params.token}/accept`, { method: 'POST' })).organization; }
    catch (cause) { if (cause instanceof MarlApiError && cause.status === 401) needsSignIn = true; else error = cause instanceof MarlApiError ? cause.message : 'The invitation could not be accepted.'; }
    finally { busy = false; }
  }
</script>

<AuthShell title={organization ? `Welcome to ${organization.name}` : 'Join an organization'} description={organization ? 'Your membership is active.' : 'Accept this invitation with the exact email address it was sent to.'}>
  <div class="invitation">{#if organization}<CheckCircle2 size={28} /><a href={`/organizations/${organization.slug}/settings/access`}>Open {organization.name}</a>{:else}{#if error}<p>{error}</p>{/if}{#if needsSignIn}<a class="primary" href={`/sign-in?returnTo=${encodeURIComponent($page.url.pathname)}`}>Sign in to continue</a>{:else}<button class="primary" disabled={busy} onclick={accept}>Accept invitation</button>{/if}{/if}</div>
</AuthShell>

<style>.invitation{display:grid;justify-items:center;gap:14px;color:var(--success)}.invitation p{width:100%;padding:9px;border-radius:6px;background:var(--danger-soft);color:var(--danger);font-size:10px}.invitation button,.invitation a{display:flex;width:100%;height:38px;align-items:center;justify-content:center;border:1px solid var(--brand);border-radius:6px;background:var(--brand);color:#fff;cursor:pointer;font-size:11px;font-weight:650;text-decoration:none}</style>
