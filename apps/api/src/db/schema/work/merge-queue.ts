import { sqliteTable, text, integer, index, uniqueIndex, check } from 'drizzle-orm/sqlite-core';
import type { AnySQLiteColumn } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { users } from '../people/identity';
import { repositories } from '../code/repositories';
import { pullRequests } from './reviews';

export const mergeQueueEntries = sqliteTable(
  'merge_queue_entries',
  {
    id: text('id').primaryKey(),
    repositoryId: text('repository_id')
      .notNull()
      .references((): AnySQLiteColumn => repositories.id, { onDelete: 'cascade' }),
    targetBranch: text('target_branch').notNull(),
    pullRequestId: text('pull_request_id')
      .notNull()
      .references((): AnySQLiteColumn => pullRequests.id, { onDelete: 'cascade' }),
    headCommitId: text('head_commit_id').notNull(),
    method: text('method').notNull(),
    enqueuedBy: text('enqueued_by')
      .notNull()
      .references((): AnySQLiteColumn => users.id),
    state: text('state')
      .notNull()
      .default(sql`'queued'`),
    attempt: integer('attempt')
      .notNull()
      .default(sql`0`),
    queueBranch: text('queue_branch'),
    baseCommitId: text('base_commit_id'),
    mergeCommitId: text('merge_commit_id'),
    reason: text('reason'),
    enqueuedAt: text('enqueued_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text('updated_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`)
  },
  (table) => [
    index('merge_queue_by_target').on(table.repositoryId, table.targetBranch, table.state, table.enqueuedAt),
    index('merge_queue_by_commit')
      .on(table.mergeCommitId)
      .where(sql`state = 'testing'`),
    uniqueIndex('merge_queue_active_pull')
      .on(table.pullRequestId)
      .where(sql`state IN ('queued','testing','merging')`),
    check('merge_queue_state', sql`state IN ('queued','testing','merging','merged','failed','removed')`),
    check('merge_queue_method', sql`method IN ('merge','squash','rebase')`)
  ]
);
