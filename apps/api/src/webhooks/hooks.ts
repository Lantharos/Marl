import type { Webhook, WebhookDelivery } from '@marl/contracts';
import type { Principal } from '../auth/principal';
import { auditStatement } from '../core/audit';
import { identifier } from '../core/domain';
import type { Env } from '../core/platform';
import { encryptSecret } from '../core/secret-crypto';
import { json, problem, readJson } from '../http/http';
import { webhookBody, webhookUpdateBody } from '../http/request-schemas';
import { hookScope, type WebhookScope } from './scope';

type HookRow = Omit<Webhook, 'events' | 'active' | 'lastDelivery'> & {
  eventsJson: string;
  active: number;
  lastStatus: WebhookDelivery['status'] | null;
  lastResponseStatus: number | null;
  lastCreatedAt: string | null;
};

const hookSelect = `SELECT webhooks.id,webhooks.url,webhooks.format,webhooks.events_json AS eventsJson,webhooks.active,webhooks.created_at AS createdAt,last.status AS lastStatus,last.response_status AS lastResponseStatus,last.created_at AS lastCreatedAt FROM webhooks LEFT JOIN webhook_deliveries AS last ON last.id=(SELECT id FROM webhook_deliveries WHERE webhook_id=webhooks.id ORDER BY created_at DESC LIMIT 1)`;

function toWebhook(row: HookRow): Webhook {
  return {
    id: row.id,
    url: row.url,
    format: row.format,
    events: JSON.parse(row.eventsJson),
    active: Boolean(row.active),
    createdAt: row.createdAt,
    lastDelivery: row.lastStatus
      ? { status: row.lastStatus, responseStatus: row.lastResponseStatus, createdAt: row.lastCreatedAt! }
      : null
  };
}

function privateHost(hostname: string) {
  return (
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.internal') ||
    /^(127|10|0)\./.test(hostname) ||
    /^192\.168\./.test(hostname) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(hostname) ||
    /^169\.254\./.test(hostname) ||
    hostname.startsWith('[')
  );
}

function validTarget(env: Env, value: string) {
  if (!URL.canParse(value)) return false;
  const url = new URL(value);
  if (env.ENVIRONMENT === 'development') return url.protocol === 'https:' || url.protocol === 'http:';
  return url.protocol === 'https:' && !url.username && !url.password && !privateHost(url.hostname);
}

function randomSecret() {
  return [...crypto.getRandomValues(new Uint8Array(24))].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function listWebhooks(env: Env, scope: WebhookScope | null) {
  if (!scope) return problem(404, 'not_found', 'Not found.');
  const rows = await env.DB.prepare(
    `${hookSelect} WHERE webhooks.organization_id=? AND webhooks.repository_id IS ? ORDER BY webhooks.created_at`
  )
    .bind(scope.organizationId, scope.repositoryId)
    .all<HookRow>();
  return json({ webhooks: rows.results.map(toWebhook) });
}

export async function createWebhook(request: Request, env: Env, principal: Principal, scope: WebhookScope | null) {
  if (!scope) return problem(404, 'not_found', 'Not found.');
  const body = await readJson(request, webhookBody);
  if (!body || !body.events.length) return problem(422, 'invalid_webhook', 'Choose at least one event.');
  if (!validTarget(env, body.url)) return problem(422, 'invalid_webhook_url', 'Use a public https:// address.');
  const id = identifier('webhook');
  const secret = body.secret?.trim() || randomSecret();
  const encrypted = await encryptSecret(env, scope.organizationId, scope.repositoryId, `webhook:${id}`, secret);
  await env.DB.batch([
    env.DB.prepare(
      'INSERT INTO webhooks (id,organization_id,repository_id,url,format,events_json,secret_ciphertext,secret_nonce,created_by) VALUES (?,?,?,?,?,?,?,?,?)'
    ).bind(
      id,
      scope.organizationId,
      scope.repositoryId,
      body.url,
      body.format,
      JSON.stringify([...new Set(body.events)]),
      encrypted.ciphertext,
      encrypted.nonce,
      principal.id
    ),
    auditStatement(env, {
      organizationId: scope.organizationId,
      repositoryId: scope.repositoryId,
      actor: principal,
      action: 'webhook.created',
      subjectType: 'webhook',
      subjectId: id,
      details: { url: new URL(body.url).origin, events: body.events }
    })
  ]);
  const created = await env.DB.prepare(`${hookSelect} WHERE webhooks.id=?`).bind(id).first<HookRow>();
  return json({ webhook: toWebhook(created!), secret }, { status: 201 });
}

export async function updateWebhook(request: Request, env: Env, principal: Principal, webhookId: string) {
  const scope = await hookScope(env, principal, webhookId);
  if (!scope) return problem(404, 'webhook_not_found', 'Webhook not found.');
  const body = await readJson(request, webhookUpdateBody);
  if (!body) return problem(422, 'invalid_webhook', 'The webhook settings are invalid.');
  if (body.url !== undefined && !validTarget(env, body.url))
    return problem(422, 'invalid_webhook_url', 'Use a public https:// address.');
  if (body.events && !body.events.length) return problem(422, 'invalid_webhook', 'Choose at least one event.');
  const encrypted = body.secret
    ? await encryptSecret(env, scope.organizationId, scope.repositoryId, `webhook:${webhookId}`, body.secret)
    : null;
  await env.DB.batch([
    env.DB.prepare(
      'UPDATE webhooks SET url=COALESCE(?,url),format=COALESCE(?,format),events_json=COALESCE(?,events_json),active=COALESCE(?,active),secret_ciphertext=COALESCE(?,secret_ciphertext),secret_nonce=COALESCE(?,secret_nonce),updated_at=CURRENT_TIMESTAMP WHERE id=?'
    ).bind(
      body.url ?? null,
      body.format ?? null,
      body.events ? JSON.stringify([...new Set(body.events)]) : null,
      body.active === undefined ? null : body.active ? 1 : 0,
      encrypted?.ciphertext ?? null,
      encrypted?.nonce ?? null,
      webhookId
    ),
    auditStatement(env, {
      organizationId: scope.organizationId,
      repositoryId: scope.repositoryId,
      actor: principal,
      action: 'webhook.updated',
      subjectType: 'webhook',
      subjectId: webhookId
    })
  ]);
  const updated = await env.DB.prepare(`${hookSelect} WHERE webhooks.id=?`).bind(webhookId).first<HookRow>();
  return json({ webhook: toWebhook(updated!) });
}

export async function deleteWebhook(env: Env, principal: Principal, webhookId: string) {
  const scope = await hookScope(env, principal, webhookId);
  if (!scope) return problem(404, 'webhook_not_found', 'Webhook not found.');
  await env.DB.batch([
    env.DB.prepare('DELETE FROM webhooks WHERE id=?').bind(webhookId),
    auditStatement(env, {
      organizationId: scope.organizationId,
      repositoryId: scope.repositoryId,
      actor: principal,
      action: 'webhook.deleted',
      subjectType: 'webhook',
      subjectId: webhookId
    })
  ]);
  return new Response(null, { status: 204 });
}

export async function listDeliveries(env: Env, principal: Principal, webhookId: string) {
  if (!(await hookScope(env, principal, webhookId))) return problem(404, 'webhook_not_found', 'Webhook not found.');
  const rows = await env.DB.prepare(
    'SELECT id,event,action,status,response_status AS responseStatus,response_excerpt AS responseExcerpt,attempts,duration_ms AS durationMs,created_at AS createdAt FROM webhook_deliveries WHERE webhook_id=? ORDER BY created_at DESC LIMIT 30'
  )
    .bind(webhookId)
    .all<WebhookDelivery>();
  return json({ deliveries: rows.results });
}

async function enqueue(env: Env, webhookId: string, event: string, action: string, payload: string) {
  const id = identifier('delivery');
  await env.DB.prepare('INSERT INTO webhook_deliveries (id,webhook_id,event,action,payload) VALUES (?,?,?,?,?)')
    .bind(id, webhookId, event, action, payload)
    .run();
  await env.WEBHOOK_QUEUE.send({ deliveryId: id });
  return id;
}

export async function redeliver(env: Env, principal: Principal, deliveryId: string) {
  const delivery = await env.DB.prepare(
    'SELECT webhook_id AS webhookId,event,action,payload FROM webhook_deliveries WHERE id=?'
  )
    .bind(deliveryId)
    .first<{ webhookId: string; event: string; action: string; payload: string }>();
  if (!delivery || !(await hookScope(env, principal, delivery.webhookId)))
    return problem(404, 'delivery_not_found', 'Delivery not found.');
  const id = await enqueue(env, delivery.webhookId, delivery.event, delivery.action, delivery.payload);
  return json({ deliveryId: id }, { status: 202 });
}

export async function pingWebhook(env: Env, principal: Principal, webhookId: string) {
  if (!(await hookScope(env, principal, webhookId))) return problem(404, 'webhook_not_found', 'Webhook not found.');
  const payload = JSON.stringify({
    event: 'ping',
    action: 'ping',
    repository: null,
    sender: { handle: principal.handle, url: `${env.PUBLIC_URL}/${principal.handle}` },
    webhook: { id: webhookId }
  });
  const id = await enqueue(env, webhookId, 'ping', 'ping', payload);
  return json({ deliveryId: id }, { status: 202 });
}
