import { sqliteTable, text, index, uniqueIndex, check } from 'drizzle-orm/sqlite-core';
import type { AnySQLiteColumn } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { users } from './identity';
import { repositories } from './repositories';

export const abuseReports = sqliteTable(
  'abuse_reports',
  {
    id: text('id').primaryKey(),
    reporterId: text('reporter_id')
      .notNull()
      .references((): AnySQLiteColumn => users.id),
    subjectType: text('subject_type').notNull(),
    subjectId: text('subject_id').notNull(),
    repositoryId: text('repository_id').references((): AnySQLiteColumn => repositories.id, { onDelete: 'cascade' }),
    reason: text('reason').notNull(),
    details: text('details')
      .notNull()
      .default(sql`''`),
    state: text('state')
      .notNull()
      .default(sql`'open'`),
    resolution: text('resolution'),
    resolvedBy: text('resolved_by').references((): AnySQLiteColumn => users.id),
    resolvedAt: text('resolved_at'),
    createdAt: text('created_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`)
  },
  (table) => [
    index('abuse_reports_by_state').on(table.state, table.createdAt),
    uniqueIndex('abuse_reports_open_by_reporter')
      .on(table.reporterId, table.subjectType, table.subjectId)
      .where(sql`state = 'open'`),
    check(
      'abuse_reports_subject',
      sql`subject_type IN ('repository','issue','pull','issue_comment','pull_comment','review_comment','user')`
    ),
    check(
      'abuse_reports_reason',
      sql`reason IN ('spam','malware','harassment','copyright','private_information','illegal','other')`
    ),
    check('abuse_reports_state', sql`state IN ('open','actioned','dismissed')`)
  ]
);
