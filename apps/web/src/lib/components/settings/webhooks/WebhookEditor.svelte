<script lang="ts">
  import type { Webhook, WebhookEvent, WebhookFormat } from '@marl/contracts';
  import { api, MarlApiError } from '$lib/api';
  import Button from '../../controls/Button.svelte';
  import Checkbox from '../../controls/Checkbox.svelte';
  import Field from '../../controls/Field.svelte';
  import Notice from '../../feedback/Notice.svelte';
  import Modal from '../../overlays/Modal.svelte';
  import SettingsChoices from '../SettingsChoices.svelte';

  let {
    open,
    endpoint,
    webhook,
    onSaved,
    onClose
  }: {
    open: boolean;
    endpoint: string;
    webhook: Webhook | null;
    onSaved: (webhook: Webhook, secret: string | null) => void;
    onClose: () => void;
  } = $props();
  const eventChoices: Array<{ value: WebhookEvent; label: string; description: string }> = [
    { value: 'push', label: 'Pushes', description: 'A branch moves to a new commit.' },
    { value: 'pull', label: 'Pulls', description: 'Opened, marked ready, updated, merged, closed, or reopened.' },
    { value: 'review', label: 'Reviews', description: 'A review is submitted on a pull.' },
    { value: 'issue', label: 'Issues', description: 'Opened, closed, or reopened.' },
    { value: 'comment', label: 'Comments', description: 'A comment is added to an issue or pull.' },
    { value: 'release', label: 'Releases', description: 'A release is published.' },
    { value: 'run', label: 'Runs', description: 'A workflow run finishes.' }
  ];
  const formats: Array<{ value: WebhookFormat; label: string; description: string }> = [
    { value: 'json', label: 'JSON', description: 'The full event, signed with your secret.' },
    { value: 'slack', label: 'Slack', description: 'A readable message for a Slack incoming webhook.' },
    { value: 'discord', label: 'Discord', description: 'A readable message for a Discord channel webhook.' }
  ];
  let url = $state('');
  let format = $state<WebhookFormat>('json');
  let events = $state<WebhookEvent[]>([]);
  let secret = $state('');
  let busy = $state(false);
  let error = $state('');

  $effect.pre(() => {
    if (!open) return;
    url = webhook?.url ?? '';
    format = webhook?.format ?? 'json';
    events = webhook ? [...webhook.events] : ['push', 'pull', 'release'];
    secret = '';
    error = '';
  });

  async function save() {
    busy = true;
    error = '';
    try {
      const body = { url, format, events, ...(secret.trim() ? { secret: secret.trim() } : {}) };
      if (webhook) {
        const result = await api<{ webhook: Webhook }>(`/webhooks/${webhook.id}`, {
          method: 'PATCH',
          body: JSON.stringify(body)
        });
        onSaved(result.webhook, null);
      } else {
        const result = await api<{ webhook: Webhook; secret: string }>(endpoint, {
          method: 'POST',
          body: JSON.stringify(body)
        });
        onSaved(result.webhook, result.secret);
      }
    } catch (cause) {
      error = cause instanceof MarlApiError ? cause.message : 'The webhook could not be saved.';
    } finally {
      busy = false;
    }
  }
</script>

<Modal {open} title={webhook ? 'Edit webhook' : 'Add webhook'} onClose={() => !busy && onClose()}>
  <form
    id="webhook-form"
    class="grid gap-5"
    onsubmit={(event) => {
      event.preventDefault();
      void save();
    }}
  >
    <Field label="Payload URL">
      <input
        class="field font-mono text-sm"
        type="url"
        bind:value={url}
        placeholder="https://example.com/hooks/marl"
        required
        data-1p-ignore
      />
    </Field>
    <div class="grid gap-2">
      <span class="text-sm font-semibold text-ink-strong">Format</span>
      <SettingsChoices bind:value={format} options={formats} label="Payload format" disabled={busy} />
    </div>
    <div class="grid gap-2">
      <span class="text-sm font-semibold text-ink-strong">Events</span>
      <div class="grid gap-0.5 rounded-xl bg-surface p-1">
        {#each eventChoices as choice (choice.value)}
          <Checkbox
            checked={events.includes(choice.value)}
            label={choice.label}
            description={choice.description}
            onchange={(checked) =>
              (events = checked ? [...events, choice.value] : events.filter((event) => event !== choice.value))}
          />
        {/each}
      </div>
    </div>
    {#if format === 'json'}
      <Field
        label="Secret"
        optional
        hint={webhook
          ? 'Leave empty to keep the current secret.'
          : 'Used to sign every delivery in the X-Marl-Signature-256 header. Leave empty to generate one.'}
      >
        <input class="field font-mono text-sm" bind:value={secret} autocomplete="off" data-1p-ignore />
      </Field>
    {/if}
    {#if error}<Notice>{error}</Notice>{/if}
  </form>
  {#snippet actions()}
    <Button size="small" disabled={busy} onclick={onClose}>Cancel</Button>
    <Button
      size="small"
      variant="primary"
      type="submit"
      form="webhook-form"
      loading={busy}
      disabled={!url || !events.length}>{webhook ? 'Save webhook' : 'Add webhook'}</Button
    >
  {/snippet}
</Modal>
