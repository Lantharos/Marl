import { sqliteTable, text, primaryKey, index, check } from 'drizzle-orm/sqlite-core';
import type { AnySQLiteColumn } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { users } from './identity';
import { repositories } from '../code/repositories';

export const notificationSettings = sqliteTable(
  'notification_settings',
  {
    userId: text('user_id')
      .primaryKey()
      .references((): AnySQLiteColumn => users.id, { onDelete: 'cascade' }),
    emailMode: text('email_mode')
      .notNull()
      .default(sql`'immediate'`),
    reasonsJson: text('reasons_json')
      .notNull()
      .default(sql`'["mention","assignment","participating","authored","failure"]'`),
    lastEmailedAt: text('last_emailed_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`)
  },
  (table) => [
    index('notification_settings_due').on(table.emailMode, table.lastEmailedAt),
    check('notification_settings_mode', sql`email_mode IN ('immediate','daily','off')`)
  ]
);

export const repositoryNotificationLevels = sqliteTable(
  'repository_notification_levels',
  {
    userId: text('user_id')
      .notNull()
      .references((): AnySQLiteColumn => users.id, { onDelete: 'cascade' }),
    repositoryId: text('repository_id')
      .notNull()
      .references((): AnySQLiteColumn => repositories.id, { onDelete: 'cascade' }),
    level: text('level').notNull()
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.repositoryId] }),
    check('repository_notification_levels_level', sql`level IN ('mentions','ignore')`)
  ]
);
