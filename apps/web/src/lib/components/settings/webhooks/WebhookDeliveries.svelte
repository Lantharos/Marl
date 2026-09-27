<script lang="ts">
  import type { Webhook, WebhookDelivery } from '@marl/contracts';
  import CircleCheck from '@lucide/svelte/icons/circle-check';
  import CircleDashed from '@lucide/svelte/icons/circle-dashed';
  import CircleX from '@lucide/svelte/icons/circle-x';
  import RotateCcw from '@lucide/svelte/icons/rotate-ccw';
  import Send from '@lucide/svelte/icons/send';
  import { api } from '$lib/api';
  import Button from '../../controls/Button.svelte';
  import Spinner from '../../feedback/Spinner.svelte';
  import Modal from '../../overlays/Modal.svelte';
  import Time from '../../page/Time.svelte';

  let { webhook, onClose }: { webhook: Webhook | null; onClose: () => void } = $props();
  let deliveries = $state<WebhookDelivery[] | null>(null);
  let expanded = $state<string | null>(null);

  async function load(id: string) {
    deliveries = (await api<{ deliveries: WebhookDelivery[] }>(`/webhooks/${id}/deliveries`)).deliveries;
  }

  $effect(() => {
    if (!webhook) return;
    deliveries = null;
    void load(webhook.id);
  });

  async function ping() {
    if (!webhook) return;
    await api(`/webhooks/${webhook.id}/ping`, { method: 'POST', body: '{}' });
    await load(webhook.id);
  }

  async function redeliver(delivery: WebhookDelivery) {
    if (!webhook) return;
    await api(`/webhook-deliveries/${delivery.id}/redeliver`, { method: 'POST', body: '{}' });
    await load(webhook.id);
  }
</script>

<Modal open={webhook !== null} size="large" title="Recent deliveries" description={webhook?.url} {onClose}>
  <div class="mb-3 flex justify-between gap-2">
    <Button size="small" onclick={ping}><Send size={14} />Send a test event</Button>
    <Button size="small" variant="ghost" onclick={() => webhook && load(webhook.id)}>Refresh</Button>
  </div>
  {#if deliveries === null}
    <span class="flex items-center gap-2 py-6 text-sm text-ink-muted"><Spinner />Loading deliveries</span>
  {:else}
    <div class="grid gap-0.5">
      {#each deliveries as delivery (delivery.id)}
        <div class="rounded-lg transition-colors hover:bg-surface-hover">
          <button
            type="button"
            class="grid w-full grid-cols-[18px_minmax(0,1fr)_auto] items-center gap-3 px-2.5 py-2.5 text-left"
            aria-expanded={expanded === delivery.id}
            onclick={() => (expanded = expanded === delivery.id ? null : delivery.id)}
          >
            {#if delivery.status === 'delivered'}<CircleCheck
                size={16}
                class="text-success"
              />{:else if delivery.status === 'failed'}<CircleX size={16} class="text-danger" />{:else}<CircleDashed
                size={16}
                class="text-ink-faint"
              />{/if}
            <span class="min-w-0">
              <span class="block truncate font-mono text-xs text-ink-strong">{delivery.event}.{delivery.action}</span>
              <span class="block text-xs text-ink-muted"
                ><Time value={delivery.createdAt} class="text-ink-muted" />{delivery.attempts > 1
                  ? ` · ${delivery.attempts} attempts`
                  : ''}</span
              >
            </span>
            <span class="text-xs text-ink-muted tabular-nums"
              >{delivery.responseStatus ??
                (delivery.status === 'pending' ? 'Queued' : 'No response')}{delivery.durationMs !== null
                ? ` · ${delivery.durationMs} ms`
                : ''}</span
            >
          </button>
          {#if expanded === delivery.id}
            <div class="grid gap-2 px-2.5 pb-3 pl-11">
              {#if delivery.responseExcerpt}<pre
                  class="max-h-40 overflow-auto rounded-lg bg-surface-muted p-2.5 font-mono text-xs whitespace-pre-wrap text-ink">{delivery.responseExcerpt}</pre>{/if}
              <Button size="small" class="justify-self-start" onclick={() => redeliver(delivery)}
                ><RotateCcw size={13} />Redeliver</Button
              >
            </div>
          {/if}
        </div>
      {:else}
        <p class="py-6 text-center text-sm text-ink-muted">No deliveries yet.</p>
      {/each}
    </div>
  {/if}
</Modal>
