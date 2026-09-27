import type { WebhookFormat } from '@marl/contracts';
import type { Env } from '../core/platform';
import { decryptSecret } from '../core/secret-crypto';
import { hmacSha256Hex } from '../core/signed-token';
import { formatBody } from './formats';

type DeliveryRow = {
  id: string;
  event: string;
  payload: string;
  attempts: number;
  webhookId: string;
  url: string;
  format: WebhookFormat;
  organizationId: string;
  repositoryId: string | null;
  secretCiphertext: string;
  secretNonce: string;
};

const maxAttempts = 6;

export async function webhookSecret(
  env: Env,
  row: Pick<DeliveryRow, 'webhookId' | 'organizationId' | 'repositoryId' | 'secretCiphertext' | 'secretNonce'>
) {
  return decryptSecret(env, {
    organizationId: row.organizationId,
    repositoryId: row.repositoryId,
    name: `webhook:${row.webhookId}`,
    ciphertext: row.secretCiphertext,
    nonce: row.secretNonce
  });
}

async function attempt(env: Env, delivery: DeliveryRow) {
  const body = formatBody(delivery.format, delivery.payload);
  const signature = await hmacSha256Hex(await webhookSecret(env, delivery), body);
  const started = Date.now();
  try {
    const response = await fetch(delivery.url, {
      method: 'POST',
      redirect: 'manual',
      signal: AbortSignal.timeout(10_000),
      headers: {
        'content-type': 'application/json',
        'user-agent': 'Marl-Hookshot',
        'x-marl-event': delivery.event,
        'x-marl-delivery': delivery.id,
        'x-marl-signature-256': `sha256=${signature}`
      },
      body
    });
    const excerpt = (await response.text().catch(() => '')).slice(0, 1000);
    return { ok: response.ok, status: response.status, excerpt, duration: Date.now() - started };
  } catch (error) {
    return {
      ok: false,
      status: null,
      excerpt: error instanceof Error ? error.message : String(error),
      duration: Date.now() - started
    };
  }
}

export async function deliverWebhooks(batch: MessageBatch<{ deliveryId: string }>, env: Env) {
  for (const message of batch.messages) {
    const delivery = await env.DB.prepare(
      `SELECT webhook_deliveries.id,webhook_deliveries.event,webhook_deliveries.payload,webhook_deliveries.attempts,webhooks.id AS webhookId,webhooks.url,webhooks.format,webhooks.organization_id AS organizationId,webhooks.repository_id AS repositoryId,webhooks.secret_ciphertext AS secretCiphertext,webhooks.secret_nonce AS secretNonce FROM webhook_deliveries JOIN webhooks ON webhooks.id=webhook_deliveries.webhook_id WHERE webhook_deliveries.id=? AND webhook_deliveries.status='pending' AND webhooks.active=1`
    )
      .bind(message.body.deliveryId)
      .first<DeliveryRow>();
    if (!delivery) {
      message.ack();
      continue;
    }
    const result = await attempt(env, delivery);
    const attempts = delivery.attempts + 1;
    const final = result.ok || attempts >= maxAttempts;
    await env.DB.prepare(
      `UPDATE webhook_deliveries SET attempts=?,response_status=?,response_excerpt=?,duration_ms=?,status=?,completed_at=CASE WHEN ? THEN CURRENT_TIMESTAMP END WHERE id=?`
    )
      .bind(
        attempts,
        result.status,
        result.excerpt,
        result.duration,
        result.ok ? 'delivered' : final ? 'failed' : 'pending',
        final ? 1 : 0,
        delivery.id
      )
      .run();
    if (final) message.ack();
    else message.retry({ delaySeconds: Math.min(3600, 30 * 2 ** (attempts - 1)) });
  }
}
