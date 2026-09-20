import { sqliteTable, integer, text, primaryKey, foreignKey, index, check } from 'drizzle-orm/sqlite-core';
import type { AnySQLiteColumn } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { users } from './identity';
import { repositories } from './repositories';

export const branchRules = sqliteTable('branch_rules', {
  repositoryId: text('repository_id').notNull().references((): AnySQLiteColumn => repositories.id, { onDelete: 'cascade' }),
  pattern: text('pattern').notNull(),
  requiredApprovals: integer('required_approvals').notNull().default(sql`0`),
  requiredChecksJson: text('required_checks_json').notNull().default(sql`'[]'`),
  requireConversations: integer('require_conversations').notNull().default(sql`1`),
  allowedMergeMethodsJson: text('allowed_merge_methods_json').notNull().default(sql`'["merge","squash","rebase"]'`),
  updatedBy: text('updated_by').notNull().references((): AnySQLiteColumn => users.id),
  updatedAt: text('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  carryApprovalsForward: integer('carry_approvals_forward').notNull().default(sql`0`),
  allowAuthorMerge: integer('allow_author_merge').notNull().default(sql`0`),
}, (table) => [
  primaryKey({ columns: [table.repositoryId, table.pattern] }),
  check('branch_rules_check_0', sql`required_approvals BETWEEN 0 AND 10`),
  check('branch_rules_check_1', sql`require_conversations IN (0, 1)`),
  check('branch_rules_check_2', sql`carry_approvals_forward IN (0,1)`),
  check('branch_rules_check_3', sql`allow_author_merge IN (0,1)`),
]);

export const branches = sqliteTable('branches', {
  repositoryId: text('repository_id').notNull().references((): AnySQLiteColumn => repositories.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  commitId: text('commit_id').notNull(),
  updatedAt: text('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  indexVersion: text('index_version').notNull().default(sql`''`),
}, (table) => [
  primaryKey({ columns: [table.repositoryId, table.name] }),
  foreignKey({ columns: [table.repositoryId, table.commitId], foreignColumns: [commits.repositoryId, commits.id] }),
  index('branches_by_index_version').on(table.repositoryId, table.indexVersion),
]);

export const commitChanges = sqliteTable('commit_changes', {
  repositoryId: text('repository_id').notNull(),
  commitId: text('commit_id').notNull(),
  path: text('path').notNull(),
  position: integer('position').notNull().default(sql`0`),
}, (table) => [
  primaryKey({ columns: [table.repositoryId, table.commitId, table.path] }),
  foreignKey({ columns: [table.repositoryId, table.commitId], foreignColumns: [commits.repositoryId, commits.id] }).onDelete('cascade'),
  index('commit_changes_by_position').on(table.repositoryId, table.path, table.position),
  index('commit_changes_by_path').on(table.repositoryId, table.path, table.commitId),
]);

export const commits = sqliteTable('commits', {
  id: text('id').notNull(),
  repositoryId: text('repository_id').notNull().references((): AnySQLiteColumn => repositories.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  authorName: text('author_name').notNull(),
  authorEmail: text('author_email').notNull(),
  authoredAt: text('authored_at').notNull(),
  parentIds: text('parent_ids').notNull().default(sql`'[]'`),
  treeId: text('tree_id').notNull(),
  signatureStatus: text('signature_status').notNull().default(sql`'unverified'`),
  signatureSignerId: text('signature_signer_id').references((): AnySQLiteColumn => users.id),
  signatureKeyFingerprint: text('signature_key_fingerprint'),
}, (table) => [
  primaryKey({ columns: [table.repositoryId, table.id] }),
  index('commits_signature_signer').on(table.signatureSignerId, table.signatureKeyFingerprint),
  index('commits_by_time').on(table.repositoryId, sql`${table.authoredAt} COLLATE BINARY DESC`),
  check('commits_check_0', sql`signature_status IN ('verified', 'unverified', 'invalid')`),
]);

export const indexedCommitChanges = sqliteTable('indexed_commit_changes', {
  repositoryId: text('repository_id').notNull(),
  commitId: text('commit_id').notNull(),
}, (table) => [
  primaryKey({ columns: [table.repositoryId, table.commitId] }),
  foreignKey({ columns: [table.repositoryId, table.commitId], foreignColumns: [commits.repositoryId, commits.id] }).onDelete('cascade'),
]);
