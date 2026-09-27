import { sqliteTable, text, integer, index, uniqueIndex, check } from 'drizzle-orm/sqlite-core';
import type { AnySQLiteColumn } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { users } from './identity';
import { repositories } from './repositories';

export const repositoryImports = sqliteTable(
  'repository_imports',
  {
    id: text('id').primaryKey(),
    repositoryId: text('repository_id')
      .notNull()
      .references((): AnySQLiteColumn => repositories.id, { onDelete: 'cascade' }),
    requestedBy: text('requested_by')
      .notNull()
      .references((): AnySQLiteColumn => users.id),
    source: text('source').notNull(),
    defaultBranch: text('default_branch').notNull(),
    tokenCiphertext: text('token_ciphertext'),
    tokenNonce: text('token_nonce'),
    githubLogin: text('github_login'),
    optionsJson: text('options_json').notNull(),
    step: text('step')
      .notNull()
      .default(sql`'git'`),
    cursor: integer('cursor')
      .notNull()
      .default(sql`1`),
    status: text('status')
      .notNull()
      .default(sql`'running'`),
    statsJson: text('stats_json')
      .notNull()
      .default(sql`'{}'`),
    error: text('error'),
    createdAt: text('created_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text('updated_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    completedAt: text('completed_at')
  },
  (table) => [
    index('repository_imports_by_requester').on(table.requestedBy, sql`${table.createdAt} COLLATE BINARY DESC`),
    uniqueIndex('repository_imports_running')
      .on(table.repositoryId)
      .where(sql`status = 'running'`),
    check('repository_imports_status', sql`status IN ('running','completed','failed')`)
  ]
);
