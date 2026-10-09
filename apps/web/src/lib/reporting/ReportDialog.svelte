<script lang="ts">
  import type { ReportReason } from '@marl/contracts';
  import { api, MarlApiError } from '$lib/api';
  import Button from '$lib/components/controls/Button.svelte';
  import Field from '$lib/components/controls/Field.svelte';
  import Notice from '$lib/components/feedback/Notice.svelte';
  import Modal from '$lib/components/overlays/Modal.svelte';
  import SettingsChoices from '$lib/components/settings/SettingsChoices.svelte';
  import { reporting } from './reporting.svelte';

  const reasons: Array<{ value: ReportReason; label: string; description: string }> = [
    { value: 'spam', label: 'Spam', description: 'Unsolicited promotion, bulk content, or automated noise.' },
    { value: 'malware', label: 'Malware or phishing', description: 'Code or links meant to harm people or systems.' },
    { value: 'harassment', label: 'Harassment or hate', description: 'Threats, targeted abuse, or hateful content.' },
    { value: 'copyright', label: 'Copyright infringement', description: 'Your work is used without permission.' },
    {
      value: 'private_information',
      label: 'Private information',
      description: 'Someone’s personal data or credentials.'
    },
    { value: 'illegal', label: 'Illegal content', description: 'Content that breaks the law.' },
    { value: 'other', label: 'Something else', description: 'Another violation of the Acceptable Use Policy.' }
  ];
  let reason = $state<ReportReason>('spam');
  let details = $state('');
  let busy = $state(false);
  let sent = $state(false);
  let error = $state('');
  const target = $derived(reporting.target);

  $effect.pre(() => {
    if (!target) return;
    reason = 'spam';
    details = '';
    sent = false;
    error = '';
  });

  async function submit() {
    if (!target) return;
    busy = true;
    error = '';
    try {
      await api('/reports', {
        method: 'POST',
        body: JSON.stringify({ subjectType: target.type, subjectId: target.id, reason, details })
      });
      sent = true;
    } catch (cause) {
      error = cause instanceof MarlApiError ? cause.message : 'Your report could not be sent.';
    } finally {
      busy = false;
    }
  }
</script>

<Modal
  open={target !== null}
  title={sent ? 'Report sent' : `Report ${target?.label ?? ''}`}
  onClose={() => !busy && reporting.close()}
>
  {#if sent}
    <p class="text-sm leading-relaxed text-ink-muted">
      Thank you. A person will review your report. We don’t share who reported content with its author.
    </p>
  {:else}
    <div class="grid gap-5">
      <SettingsChoices bind:value={reason} options={reasons} label="What’s wrong?" disabled={busy} />
      {#if reason === 'copyright'}
        <Notice tone="warning"
          >Include the information listed in the <a
            class="font-semibold underline"
            href="/legal/copyright"
            target="_blank">copyright policy</a
          >, or email it to legal@marl.sh.</Notice
        >
      {/if}
      <Field label="Details" optional hint="Links, file paths, or anything that helps us understand the problem.">
        <textarea
          class="field min-h-24 resize-y py-3 leading-relaxed"
          bind:value={details}
          maxlength="5000"
          disabled={busy}></textarea>
      </Field>
      {#if error}<Notice>{error}</Notice>{/if}
    </div>
  {/if}
  {#snippet actions()}
    {#if sent}
      <Button size="small" variant="primary" onclick={reporting.close}>Done</Button>
    {:else}
      <Button size="small" disabled={busy} onclick={reporting.close}>Cancel</Button>
      <Button
        size="small"
        variant="primary"
        loading={busy}
        disabled={reason === 'copyright' && details.trim().length < 20}
        onclick={submit}>Send report</Button
      >
    {/if}
  {/snippet}
</Modal>
