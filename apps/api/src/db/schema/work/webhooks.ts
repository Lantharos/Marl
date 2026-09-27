import { sqliteTable, integer, text, index, check } from 'drizzle-orm/sqlite-core';
import type { AnySQLiteColumn } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { users } from '../people/identity';
import { organizations } from '../organizations';
import { repositories } from '../code/repositories';

export const webhooks = sqliteTable(
  'webhooks',
  {
    id: text('id').primaryKey(),
    organizationId: text('organization_id')
      .notNull()
      .references((): AnySQLiteColumn => organizations.id, { onDelete: 'cascade' }),
    repositoryId: text('repository_id').references((): AnySQLiteColumn => repositories.id, { onDelete: 'cascade' }),
    url: text('url').notNull(),
    format: text('format')
      .notNull()
      .default(sql`'json'`),
    eventsJson: text('events_json').notNull(),
    secretCiphertext: text('secret_ciphertext').notNull(),
    secretNonce: text('secret_nonce').notNull(),
    active: integer('active')
      .notNull()
      .default(sql`1`),
    createdBy: text('created_by').references((): AnySQLiteColumn => users.id),
    createdAt: text('created_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text('updated_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`)
  },
  (table) => [
    index('webhooks_by_repository').on(table.repositoryId),
    index('webhooks_by_organization').on(table.organizationId, table.repositoryId),
    check('webhooks_format', sql`format IN ('json','slack','discord')`),
    check('webhooks_active', sql`active IN (0,1)`)
  ]
);

export const webhookDeliveries = sqliteTable(
  'webhook_deliveries',
  {
    id: text('id').primaryKey(),
    webhookId: text('webhook_id')
      .notNull()
      .references((): AnySQLiteColumn => webhooks.id, { onDelete: 'cascade' }),
    event: text('event').notNull(),
    action: text('action').notNull(),
    payload: text('payload').notNull(),
    status: text('status')
      .notNull()
      .default(sql`'pending'`),
    responseStatus: integer('response_status'),
    responseExcerpt: text('response_excerpt'),
    attempts: integer('attempts')
      .notNull()
      .default(sql`0`),
    durationMs: integer('duration_ms'),
    createdAt: text('created_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    completedAt: text('completed_at')
  },
  (table) => [
    index('webhook_deliveries_by_webhook').on(table.webhookId, sql`${table.createdAt} COLLATE BINARY DESC`),
    check('webhook_deliveries_status', sql`status IN ('pending','delivered','failed')`)
  ]
);
