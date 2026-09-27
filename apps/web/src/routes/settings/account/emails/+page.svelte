<script lang="ts">
  import { untrack } from 'svelte';
  import type { AccountEmail } from '@marl/contracts';
  import BadgeCheck from '@lucide/svelte/icons/badge-check';
  import Clock3 from '@lucide/svelte/icons/clock-3';
  import Trash2 from '@lucide/svelte/icons/trash';
  import { api, MarlApiError } from '$lib/api';
  import Modal from '$lib/components/overlays/Modal.svelte';
  import Button from '$lib/components/controls/Button.svelte';
  import Field from '$lib/components/controls/Field.svelte';
  import Notice from '$lib/components/feedback/Notice.svelte';
  import ConfirmDialog from '$lib/components/overlays/ConfirmDialog.svelte';
  import SettingsHeader from '$lib/components/settings/SettingsHeader.svelte';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
  let emails = $state<AccountEmail[]>(untrack(() => data.emails));
  let value = $state('');
  let open = $state(false);
  let busy = $state('');
  let error = $state('');
  let notice = $state('');
  let removing = $state<AccountEmail | null>(null);

  async function addEmail() {
    if (busy || !value.trim()) return;
    busy = 'add';
    error = '';
    notice = '';
    try {
      const result = await api<{ email: AccountEmail; verificationSent: boolean }>('/emails', {
        method: 'POST',
        body: JSON.stringify({ email: value })
      });
      emails = [...emails, result.email];
      value = '';
      open = false;
      notice = result.verificationSent ? 'Verification email sent.' : 'Email verified for local development.';
    } catch (cause) {
      error = cause instanceof MarlApiError ? cause.message : 'The email could not be added.';
    } finally {
      busy = '';
    }
  }

  async function resend(email: AccountEmail) {
    if (busy) return;
    busy = email.id;
    error = '';
    notice = '';
    try {
      const result = await api<{ verified?: boolean }>(`/emails/${email.id}/resend`, { method: 'POST', body: '{}' });
      if (result.verified)
        emails = emails.map((item) =>
          item.id === email.id ? { ...item, verified: true, verifiedAt: new Date().toISOString() } : item
        );
      notice = result.verified ? 'Email verified for local development.' : 'A new verification email was sent.';
    } catch (cause) {
      error = cause instanceof MarlApiError ? cause.message : 'The verification email could not be sent.';
    } finally {
      busy = '';
    }
  }

  async function remove(email: AccountEmail) {
    if (busy || email.primary) return;
    busy = email.id;
    error = '';
    notice = '';
    try {
      await api(`/emails/${email.id}`, { method: 'DELETE' });
      emails = emails.filter((item) => item.id !== email.id);
      removing = null;
    } catch (cause) {
      error = cause instanceof MarlApiError ? cause.message : 'The email could not be removed.';
    } finally {
      busy = '';
    }
  }
</script>

<svelte:head><title>Emails · Marl</title></svelte:head>
<SettingsHeader title="Emails" description="Verified addresses connect the commits you author to your profile.">
  {#snippet action()}<Button
      size="small"
      onclick={() => {
        error = '';
        value = '';
        open = true;
      }}>Add email</Button
    >{/snippet}
</SettingsHeader>

{#if error && !open && !removing}<Notice class="mb-4">{error}</Notice>{/if}
{#if notice}<Notice tone="success" class="mb-4">{notice}</Notice>{/if}
<div class="divide-y divide-line-subtle surface px-4 sm:px-5">
  {#each emails as email (email.id)}
    <article class="grid min-h-19 grid-cols-[24px_minmax(0,1fr)_auto] items-center gap-3">
      <span class={email.verified ? 'text-success' : 'text-warning'}
        >{#if email.verified}<BadgeCheck size={18} />{:else}<Clock3 size={18} />{/if}</span
      >
      <div class="min-w-0">
        <strong class="block truncate text-base font-semibold text-ink-strong">{email.email}</strong>
        <span class="mt-0.5 block text-sm text-ink-muted"
          >{email.primary ? 'Sign-in email' : email.verified ? 'Verified commit email' : 'Verification required'}</span
        >
      </div>
      <div class="flex gap-1.5">
        {#if !email.verified}<Button
            size="small"
            loading={busy === email.id}
            disabled={Boolean(busy)}
            onclick={() => resend(email)}>Resend</Button
          >{/if}
        {#if !email.primary}<Button
            icon
            size="small"
            variant="ghost"
            disabled={Boolean(busy)}
            aria-label={`Remove ${email.email}`}
            onclick={() => {
              error = '';
              removing = email;
            }}><Trash2 size={15} /></Button
          >{/if}
      </div>
    </article>
  {/each}
</div>

<Modal
  {open}
  title="Add email"
  description="We’ll send a link to confirm you own this address."
  onClose={() => !busy && (open = false)}
>
  <form
    id="email-form"
    onsubmit={(event) => {
      event.preventDefault();
      void addEmail();
    }}
  >
    <Field label="Email address">
      <input
        class="field"
        bind:value
        type="email"
        autocomplete="email"
        data-1p-ignore
        placeholder="you@example.com"
        required
      />
    </Field>
  </form>
  {#if error}<Notice class="mt-4">{error}</Notice>{/if}
  {#snippet actions()}
    <Button size="small" disabled={Boolean(busy)} onclick={() => (open = false)}>Cancel</Button>
    <Button
      size="small"
      type="submit"
      form="email-form"
      variant="primary"
      loading={busy === 'add'}
      disabled={!value.trim()}>Add email</Button
    >
  {/snippet}
</Modal>

<ConfirmDialog
  open={removing !== null}
  title="Remove email?"
  confirmLabel="Remove email"
  busy={Boolean(busy)}
  {error}
  onConfirm={() => removing && void remove(removing)}
  onClose={() => (removing = null)}
>
  Commits authored with <strong>{removing?.email}</strong> will no longer link to your profile.
</ConfirmDialog>
