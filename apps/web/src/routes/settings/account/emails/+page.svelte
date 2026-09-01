<script lang="ts">
  import { untrack } from 'svelte';
  import BadgeCheck from 'lucide-svelte/icons/badge-check';
  import Clock3 from 'lucide-svelte/icons/clock-3';
  import Mail from 'lucide-svelte/icons/mail';
  import Trash2 from 'lucide-svelte/icons/trash-2';
  import { api, MarlApiError } from '$lib/api';
  import Button from '$lib/components/Button.svelte';
  import type { PageData } from './$types';

  type Email = { id: string; email: string; primary: boolean; verified: boolean; verifiedAt: string | null; createdAt: string };
  let { data } = $props<{ data: PageData }>();
  let emails = $state<Email[]>(untrack(() => data.emails));
  let value = $state('');
  let busy = $state('');
  let error = $state('');
  let notice = $state('');

  async function addEmail() {
    if (busy || !value.trim()) return;
    busy = 'add'; error = ''; notice = '';
    try {
      const result = await api<{ email: Email; verificationSent: boolean }>('/emails', { method: 'POST', body: JSON.stringify({ email: value }) });
      emails = [...emails, result.email];
      value = '';
      notice = result.verificationSent ? 'Verification email sent.' : 'Email verified for local development.';
    } catch (cause) { error = cause instanceof MarlApiError ? cause.message : 'The email could not be added.'; }
    finally { busy = ''; }
  }

  async function resend(email: Email) {
    if (busy) return;
    busy = email.id; error = ''; notice = '';
    try {
      const result = await api<{ verified?: boolean }>(`/emails/${email.id}/resend`, { method: 'POST', body: '{}' });
      if (result.verified) emails = emails.map((item) => item.id === email.id ? { ...item, verified: true, verifiedAt: new Date().toISOString() } : item);
      notice = result.verified ? 'Email verified for local development.' : 'A new verification email was sent.';
    } catch (cause) { error = cause instanceof MarlApiError ? cause.message : 'The verification email could not be sent.'; }
    finally { busy = ''; }
  }

  async function remove(email: Email) {
    if (busy || email.primary) return;
    busy = email.id; error = ''; notice = '';
    try { await api(`/emails/${email.id}`, { method: 'DELETE' }); emails = emails.filter((item) => item.id !== email.id); }
    catch (cause) { error = cause instanceof MarlApiError ? cause.message : 'The email could not be removed.'; }
    finally { busy = ''; }
  }
</script>

<svelte:head><title>Emails · Marl</title></svelte:head>
<header class="page-head"><h2>Emails</h2><p>Verified addresses connect commits to your current name, username, and profile picture.</p></header>
<form onsubmit={(event) => { event.preventDefault(); void addEmail(); }}>
  <label><span>Add an email</span><input bind:value type="email" autocomplete="email" data-1p-ignore placeholder="you@example.com" required /></label>
  <Button type="submit" variant="primary" loading={busy === 'add'} disabled={Boolean(busy) || !value.trim()}><Mail size={14} />Add email</Button>
</form>
{#if error}<p class="message error" role="alert">{error}</p>{/if}{#if notice}<p class="message notice" role="status">{notice}</p>{/if}
<div class="email-list">
  {#each emails as email (email.id)}
    <article><span class:verified={email.verified} class="status">{#if email.verified}<BadgeCheck size={17} />{:else}<Clock3 size={17} />{/if}</span><div><strong>{email.email}</strong><small>{email.primary ? 'Sign-in email' : email.verified ? 'Verified commit email' : 'Verification required'}</small></div>{#if !email.verified}<Button size="small" disabled={Boolean(busy)} onclick={() => resend(email)}>Resend</Button>{/if}{#if !email.primary}<Button icon size="small" variant="danger-soft" disabled={Boolean(busy)} aria-label={`Remove ${email.email}`} onclick={() => remove(email)}><Trash2 size={14} /></Button>{/if}</article>
  {/each}
</div>

<style>
  .page-head{padding-bottom:24px;border-bottom:1px solid var(--border-subtle)}h2{margin:0;color:var(--text-strong);font-size:25px;letter-spacing:-.03em}.page-head p{margin:7px 0 0;color:var(--text-muted);font-size:13px;line-height:1.5}form{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:end;gap:12px;padding:24px 0;border-bottom:1px solid var(--border-subtle)}label{display:grid;gap:7px}label span{color:var(--text-strong);font-size:12px;font-weight:630}input{box-sizing:border-box;width:100%;height:38px;padding:0 10px;border:1px solid var(--border-strong);border-radius:6px;outline:0;background:var(--surface);color:var(--text-strong);font:inherit;font-size:13px}input:focus{border-color:var(--brand)}.message{margin:12px 0 0;padding:10px;border-radius:6px;font-size:11px}.error{background:var(--danger-soft);color:var(--danger)}.notice{background:var(--success-soft);color:var(--success)}.email-list article{display:grid;grid-template-columns:36px minmax(0,1fr) auto auto;align-items:center;gap:10px;min-height:70px;border-bottom:1px solid var(--border-subtle)}.status{display:grid;width:32px;height:32px;border-radius:50%;background:var(--surface);color:var(--text-faint);place-items:center}.status.verified{background:var(--success-soft);color:var(--success)}.email-list strong,.email-list small{display:block}.email-list strong{overflow:hidden;color:var(--text-strong);font-size:13px;text-overflow:ellipsis;white-space:nowrap}.email-list small{margin-top:3px;color:var(--text-muted);font-size:11px}@media(max-width:620px){form{grid-template-columns:1fr}.email-list article{grid-template-columns:36px minmax(0,1fr) auto}.email-list article>:global(.button:last-child){grid-column:3}.email-list article>:global(.button:nth-last-child(2)){display:none}}
</style>
