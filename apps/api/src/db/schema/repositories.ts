import { sqliteTable, integer, text, primaryKey, index, uniqueIndex, check } from 'drizzle-orm/sqlite-core';
import type { AnySQLiteColumn } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { nocaseText } from './types';
import { organizations, teams } from './organizations';
import { users } from './identity';

export const auditEvents = sqliteTable('audit_events', {
  id: text('id').primaryKey(),
  organizationId: text('organization_id').notNull(),
  repositoryId: text('repository_id'),
  actorId: text('actor_id'),
  actorHandle: text('actor_handle').notNull(),
  action: text('action').notNull(),
  subjectType: text('subject_type').notNull(),
  subjectId: text('subject_id').notNull(),
  detailsJson: text('details_json').notNull().default(sql`'{}'`),
  createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index('audit_events_by_repository').on(table.repositoryId, sql`${table.createdAt} COLLATE BINARY DESC`),
  index('audit_events_by_organization').on(table.organizationId, sql`${table.createdAt} COLLATE BINARY DESC`),
]);

export const repositories = sqliteTable('repositories', {
  id: text('id').primaryKey(),
  organizationId: text('organization_id').notNull().references((): AnySQLiteColumn => organizations.id, { onDelete: 'cascade' }),
  name: nocaseText('name').notNull(),
  description: text('description').notNull().default(sql`''`),
  visibility: text('visibility').notNull(),
  defaultBranch: text('default_branch').notNull().default(sql`'main'`),
  createdBy: text('created_by').notNull().references((): AnySQLiteColumn => users.id),
  createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  archivedAt: text('archived_at'),
  deletionScheduledAt: text('deletion_scheduled_at'),
  deletionStartedAt: text('deletion_started_at'),
  forkedFromRepositoryId: text('forked_from_repository_id').references((): AnySQLiteColumn => repositories.id, { onDelete: 'set null' }),
  forkRootRepositoryId: text('fork_root_repository_id').references((): AnySQLiteColumn => repositories.id, { onDelete: 'set null' }),
  overviewDocumentsJson: text('overview_documents_json'),
  iconUrl: text('icon_url'),
  requireCheckApproval: integer('require_check_approval').notNull().default(sql`0`),
  signingMode: text('signing_mode').notNull().default(sql`'optional'`),
}, (table) => [
  index('repositories_by_deletion').on(table.deletionScheduledAt).where(sql`deletion_scheduled_at IS NOT NULL`),
  index('repositories_by_recency').on(sql`${table.updatedAt} COLLATE BINARY DESC`, sql`${table.id} COLLATE BINARY DESC`) .where(sql`deletion_scheduled_at IS NULL`),
  index('repositories_by_updated').on(table.organizationId, sql`${table.updatedAt} COLLATE BINARY DESC`),
  index('repositories_by_fork_root').on(table.forkRootRepositoryId),
  index('repositories_by_fork_parent').on(table.forkedFromRepositoryId),
  uniqueIndex('repositories_organization_id_name_unique').on(table.organizationId, sql`${table.name} COLLATE NOCASE`),
  check('repositories_check_0', sql`visibility IN ('private', 'public')`),
  check('repositories_check_1', sql`require_check_approval IN (0,1)`),
  check('repositories_check_2', sql`signing_mode IN ('optional','vigilant','firewall')`),
]);

export const repositoryCollaborators = sqliteTable('repository_collaborators', {
  repositoryId: text('repository_id').notNull().references((): AnySQLiteColumn => repositories.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references((): AnySQLiteColumn => users.id, { onDelete: 'cascade' }),
  role: text('role').notNull(),
  addedBy: text('added_by').notNull().references((): AnySQLiteColumn => users.id),
  createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  primaryKey({ columns: [table.repositoryId, table.userId] }),
  index('repository_collaborators_by_user').on(table.userId, table.repositoryId),
  check('repository_collaborators_check_0', sql`role IN ('read','triage','write','maintain','admin')`),
]);

export const repositoryEntries = sqliteTable('repository_entries', {
  repositoryId: text('repository_id').notNull().references((): AnySQLiteColumn => repositories.id, { onDelete: 'cascade' }),
  treeId: text('tree_id').notNull(),
  path: text('path').notNull(),
  parentPath: text('parent_path').notNull(),
  name: text('name').notNull(),
  kind: text('kind').notNull(),
  objectId: text('object_id').notNull(),
  byteSize: integer('byte_size'),
}, (table) => [
  primaryKey({ columns: [table.repositoryId, table.treeId, table.path] }),
  index('repository_entries_by_parent').on(table.repositoryId, table.treeId, table.parentPath, table.kind, table.name),
  check('repository_entries_check_0', sql`kind IN ('blob', 'tree', 'commit')`),
]);

export const repositoryLabels = sqliteTable('repository_labels', {
  id: text('id').primaryKey(),
  repositoryId: text('repository_id').notNull().references((): AnySQLiteColumn => repositories.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  color: text('color').notNull(),
  description: text('description').notNull().default(sql`''`),
}, (table) => [
  uniqueIndex('repository_labels_repository_id_name_unique').on(table.repositoryId, table.name),
]);

export const repositoryStars = sqliteTable('repository_stars', {
  repositoryId: text('repository_id').notNull().references((): AnySQLiteColumn => repositories.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references((): AnySQLiteColumn => users.id, { onDelete: 'cascade' }),
  createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  primaryKey({ columns: [table.repositoryId, table.userId] }),
  index('repository_stars_by_user').on(table.userId, sql`${table.createdAt} COLLATE BINARY DESC`),
]);

export const repositoryTeamGrants = sqliteTable('repository_team_grants', {
  repositoryId: text('repository_id').notNull().references((): AnySQLiteColumn => repositories.id, { onDelete: 'cascade' }),
  teamId: text('team_id').notNull().references((): AnySQLiteColumn => teams.id, { onDelete: 'cascade' }),
  role: text('role').notNull(),
  addedBy: text('added_by').notNull().references((): AnySQLiteColumn => users.id),
  createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  primaryKey({ columns: [table.repositoryId, table.teamId] }),
  index('repository_team_grants_by_team').on(table.teamId, table.repositoryId),
  check('repository_team_grants_check_0', sql`role IN ('read','triage','write','maintain','admin')`),
]);

export const repositoryMedia = sqliteTable('repository_media', {
  id: text('id').primaryKey(),
  repositoryId: text('repository_id').notNull().references((): AnySQLiteColumn => repositories.id, { onDelete: 'cascade' }),
  authorId: text('author_id').notNull().references((): AnySQLiteColumn => users.id),
  objectKey: text('object_key').notNull(),
  name: text('name').notNull(),
  contentType: text('content_type').notNull(),
  size: integer('size').notNull(),
  createdAt: text('created_at').notNull(),
}, (table) => [
  index('repository_media_author_created').on(table.authorId, table.createdAt),
  uniqueIndex('repository_media_object_key_unique').on(table.objectKey),
]);
