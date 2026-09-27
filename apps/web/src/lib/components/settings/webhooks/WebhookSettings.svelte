<script lang="ts">
  import { untrack } from 'svelte';
  import type { Webhook } from '@marl/contracts';
  import Check from '@lucide/svelte/icons/check';
  import Copy from '@lucide/svelte/icons/copy';
  import WebhookIcon from '@lucide/svelte/icons/webhook';
  import { api, MarlApiError } from '$lib/api';
  import Button from '../../controls/Button.svelte';
  import EmptyState from '../../feedback/EmptyState.svelte';
  import Notice from '../../feedback/Notice.svelte';
  import ActionMenu from '../../overlays/ActionMenu.svelte';
  import ConfirmDialog from '../../overlays/ConfirmDialog.svelte';
  import Modal from '../../overlays/Modal.svelte';
  import Time from '../../page/Time.svelte';
  import SettingsHeader from '../SettingsHeader.svelte';
  import WebhookDeliveries from './WebhookDeliveries.svelte';
  import WebhookEditor from './WebhookEditor.svelte';

  let {
    initialWebhooks,
    endpoint,
    scope
  }: { initialWebhooks: Webhook[]; endpoint: string; scope: 'repository' | 'organization' } = $props();
  let webhooks = $state<Webhook[]>(untrack(() => initialWebhooks));
  let editing = $state<Webhook | null | undefined>(undefined);
  let inspecting = $state<Webhook | null>(null);
  let removing = $state<Webhook | null>(null);
  let revealedSecret = $state<string | null>(null);
  let copied = $state(false);
  let busy = $state(false);
  let error = $state('');
  const formats = { json: 'JSON', slack: 'Slack', discord: 'Discord' };

  function saved(webhook: Webhook, secret: string | null) {
    webhooks = webhooks.some((item) => item.id === webhook.id)
      ? webhooks.map((item) => (item.id === webhook.id ? webhook : item))
      : [...webhooks, webhook];
    editing = undefined;
    if (secret && webhook.format === 'json') revealedSecret = secret;
  }

  async function toggle(webhook: Webhook) {
    error = '';
    try {
      const result = await api<{ webhook: Webhook }>(`/webhooks/${webhook.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ active: !webhook.active })
      });
      saved(result.webhook, null);
    } catch (cause) {
      error = cause instanceof MarlApiError ? cause.message : 'The webhook could not be updated.';
    }
  }

  async function remove() {
    if (!removing) return;
    busy = true;
    error = '';
    try {
      await api(`/webhooks/${removing.id}`, { method: 'DELETE' });
      webhooks = webhooks.filter((item) => item.id !== removing!.id);
      removing = null;
    } catch (cause) {
      error = cause instanceof MarlApiError ? cause.message : 'The webhook could not be deleted.';
    } finally {
      busy = false;
    }
  }
</script>

<SettingsHeader
  title="Webhooks"
  description={scope === 'organization'
    ? 'Send events from every repository in this organization to another service.'
    : 'Send events from this repository to deploy tools, chat, or your own service.'}
>
  {#snippet action()}<Button size="small" onclick={() => (editing = null)}>Add webhook</Button>{/snippet}
</SettingsHeader>
{#if error && !removing}<Notice class="mb-4">{error}</Notice>{/if}

<div class="divide-y divide-line-subtle surface px-4 sm:px-5">
  {#each webhooks as webhook (webhook.id)}
    <article class="grid min-h-19 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 py-3">
      <button type="button" class="min-w-0 text-left" onclick={() => (inspecting = webhook)}>
        <strong
          class={[
            'block truncate font-mono text-sm font-semibold',
            webhook.active ? 'text-ink-strong' : 'text-ink-muted'
          ]}>{webhook.url}</strong
        >
        <span class="mt-1 block truncate text-xs text-ink-muted">
          {formats[webhook.format]} · {webhook.events.join(', ')}
          {#if !webhook.active}· Paused{:else if webhook.lastDelivery}·
            <span
              class={webhook.lastDelivery.status === 'failed'
                ? 'text-danger'
                : webhook.lastDelivery.status === 'delivered'
                  ? 'text-success'
                  : ''}
              >{webhook.lastDelivery.status === 'delivered'
                ? 'Delivered'
                : webhook.lastDelivery.status === 'failed'
                  ? 'Failing'
                  : 'Sending'}</span
            >
            <Time value={webhook.lastDelivery.createdAt} class="text-ink-muted" />{/if}
        </span>
      </button>
      <ActionMenu
        label="Options for {webhook.url}"
        actions={[
          { label: 'Recent deliveries', onSelect: () => (inspecting = webhook) },
          { label: 'Edit', onSelect: () => (editing = webhook) },
          { label: webhook.active ? 'Pause' : 'Resume', onSelect: () => toggle(webhook) },
          { label: 'Delete', danger: true, onSelect: () => (removing = webhook) }
        ]}
      />
    </article>
  {:else}
    <EmptyState
      icon={WebhookIcon}
      compact
      title="No webhooks"
      description="Marl can notify another service whenever something happens here."
    />
  {/each}
</div>

<WebhookEditor
  open={editing !== undefined}
  {endpoint}
  webhook={editing ?? null}
  onSaved={saved}
  onClose={() => (editing = undefined)}
/>
<WebhookDeliveries webhook={inspecting} onClose={() => (inspecting = null)} />

<Modal
  open={revealedSecret !== null}
  size="small"
  title="Save your signing secret"
  onClose={() => (revealedSecret = null)}
>
  <p class="mb-3 text-sm leading-relaxed text-ink-muted">
    Marl signs every delivery with this secret. It won’t be shown again, but you can replace it at any time.
  </p>
  <div class="flex field min-h-0 items-center gap-1 p-0 pl-3">
    <code class="min-w-0 flex-1 truncate py-2.5 font-mono text-xs text-ink">{revealedSecret}</code>
    <Button
      icon
      size="small"
      variant="ghost"
      aria-label="Copy secret"
      onclick={async () => {
        await navigator.clipboard.writeText(revealedSecret ?? '');
        copied = true;
      }}
      >{#if copied}<Check size={15} class="text-success" />{:else}<Copy size={15} />{/if}</Button
    >
  </div>
  {#snippet actions()}<Button size="small" variant="primary" onclick={() => (revealedSecret = null)}>Done</Button
    >{/snippet}
</Modal>

<ConfirmDialog
  open={removing !== null}
  title="Delete webhook?"
  confirmLabel="Delete webhook"
  {busy}
  {error}
  onConfirm={remove}
  onClose={() => (removing = null)}
>
  <strong class="font-mono">{removing?.url}</strong> will stop receiving events.
</ConfirmDialog>
