import { sqliteTable, text, integer, index, primaryKey } from 'drizzle-orm/sqlite-core';
import type { AnySQLiteColumn } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { repositories } from './repositories';

export const codeSymbols = sqliteTable(
  'code_symbols',
  {
    repositoryId: text('repository_id')
      .notNull()
      .references((): AnySQLiteColumn => repositories.id, { onDelete: 'cascade' }),
    path: text('path').notNull(),
    line: integer('line').notNull(),
    name: text('name').notNull(),
    kind: text('kind').notNull()
  },
  (table) => [
    primaryKey({ columns: [table.repositoryId, table.path, table.line, table.name] }),
    index('code_symbols_by_name').on(sql`${table.name} COLLATE NOCASE`)
  ]
);

export const repositorySymbolIndexes = sqliteTable('repository_symbol_indexes', {
  repositoryId: text('repository_id')
    .primaryKey()
    .references((): AnySQLiteColumn => repositories.id, { onDelete: 'cascade' }),
  commitId: text('commit_id').notNull(),
  indexedAt: text('indexed_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`)
});
