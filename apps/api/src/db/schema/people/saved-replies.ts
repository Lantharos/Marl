import { sqliteTable, text, index } from 'drizzle-orm/sqlite-core';
import type { AnySQLiteColumn } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { users } from './identity';

export const savedReplies = sqliteTable(
  'saved_replies',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references((): AnySQLiteColumn => users.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    body: text('body').notNull(),
    createdAt: text('created_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text('updated_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`)
  },
  (table) => [index('saved_replies_by_user').on(table.userId, sql`${table.title} COLLATE NOCASE`)]
);
