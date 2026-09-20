import { sqliteTable, integer, text, primaryKey, index, uniqueIndex, check } from 'drizzle-orm/sqlite-core';
import type { AnySQLiteColumn } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { users } from './identity';
import { repositories, repositoryLabels } from './repositories';

export const pullRealtimeUpdates = sqliteTable('pull_realtime_updates', {
  id: text('id').primaryKey(),
  pullRequestId: text('pull_request_id').notNull().references((): AnySQLiteColumn => pullRequests.id, { onDelete: 'cascade' }),
  version: integer('version').notNull(),
  kind: text('kind').notNull(),
  payload: text('payload').notNull(),
  createdAt: text('created_at').notNull(),
}, (table) => [
  index('pull_realtime_updates_pull_version_idx').on(table.pullRequestId, table.version),
  uniqueIndex('pull_realtime_updates_pull_request_id_version_unique').on(table.pullRequestId, table.version),
]);

export const pullRequestAssignees = sqliteTable('pull_request_assignees', {
  pullRequestId: text('pull_request_id').notNull().references((): AnySQLiteColumn => pullRequests.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references((): AnySQLiteColumn => users.id, { onDelete: 'cascade' }),
}, (table) => [
  primaryKey({ columns: [table.pullRequestId, table.userId] }),
]);

export const pullRequestComments = sqliteTable('pull_request_comments', {
  id: text('id').primaryKey(),
  pullRequestId: text('pull_request_id').notNull().references((): AnySQLiteColumn => pullRequests.id, { onDelete: 'cascade' }),
  authorId: text('author_id').notNull().references((): AnySQLiteColumn => users.id),
  body: text('body').notNull(),
  createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  deletedAt: text('deleted_at'),
}, (table) => [
  index('pull_request_comments_pull_created_idx').on(table.pullRequestId, table.createdAt),
]);

export const pullRequestEvents = sqliteTable('pull_request_events', {
  id: text('id').primaryKey(),
  pullRequestId: text('pull_request_id').notNull().references((): AnySQLiteColumn => pullRequests.id, { onDelete: 'cascade' }),
  actorId: text('actor_id').notNull().references((): AnySQLiteColumn => users.id),
  kind: text('kind').notNull(),
  details: text('details').notNull().default(sql`'{}'`),
  createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index('pull_request_events_pull_created_idx').on(table.pullRequestId, table.createdAt, table.id),
]);

export const pullRequestLabels = sqliteTable('pull_request_labels', {
  pullRequestId: text('pull_request_id').notNull().references((): AnySQLiteColumn => pullRequests.id, { onDelete: 'cascade' }),
  labelId: text('label_id').notNull().references((): AnySQLiteColumn => repositoryLabels.id, { onDelete: 'cascade' }),
}, (table) => [
  primaryKey({ columns: [table.pullRequestId, table.labelId] }),
]);

export const pullRequestReviews = sqliteTable('pull_request_reviews', {
  id: text('id').primaryKey(),
  pullRequestId: text('pull_request_id').notNull().references((): AnySQLiteColumn => pullRequests.id, { onDelete: 'cascade' }),
  authorId: text('author_id').notNull().references((): AnySQLiteColumn => users.id),
  state: text('state').notNull(),
  body: text('body').notNull().default(sql`''`),
  commitId: text('commit_id').notNull(),
  createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  carriedFromReviewId: text('carried_from_review_id').references((): AnySQLiteColumn => pullRequestReviews.id),
}, (table) => [
  uniqueIndex('carried_review_per_head').on(table.carriedFromReviewId, table.commitId) .where(sql`carried_from_review_id IS NOT NULL`),
  index('reviews_by_pull').on(table.pullRequestId, table.createdAt),
  check('pull_request_reviews_check_0', sql`state IN ('commented', 'approved', 'changes_requested')`),
]);

export const pullRequests = sqliteTable('pull_requests', {
  id: text('id').primaryKey(),
  repositoryId: text('repository_id').notNull().references((): AnySQLiteColumn => repositories.id, { onDelete: 'cascade' }),
  number: integer('number').notNull(),
  title: text('title').notNull(),
  body: text('body').notNull().default(sql`''`),
  authorId: text('author_id').notNull().references((): AnySQLiteColumn => users.id),
  sourceBranch: text('source_branch').notNull(),
  targetBranch: text('target_branch').notNull(),
  sourceCommitId: text('source_commit_id').notNull(),
  targetCommitId: text('target_commit_id').notNull(),
  state: text('state').notNull().default(sql`'open'`),
  mergedCommitId: text('merged_commit_id'),
  mergedBy: text('merged_by').references((): AnySQLiteColumn => users.id),
  mergedAt: text('merged_at'),
  createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  mergeMethod: text('merge_method'),
  lockedAt: text('locked_at'),
  lockedBy: text('locked_by').references((): AnySQLiteColumn => users.id),
  realtimeVersion: integer('realtime_version').notNull().default(sql`0`),
  sourceRepositoryId: text('source_repository_id').references((): AnySQLiteColumn => repositories.id, { onDelete: 'set null' }),
}, (table) => [
  index('pull_requests_by_state').on(table.repositoryId, table.state, sql`${table.updatedAt} COLLATE BINARY DESC`),
  index('pull_requests_by_source_repository').on(table.sourceRepositoryId, table.state, table.sourceBranch),
  uniqueIndex('pull_requests_repository_id_number_unique').on(table.repositoryId, table.number),
  check('pull_requests_check_0', sql`state IN ('draft', 'open', 'merged', 'closed')`),
  check('pull_requests_check_1', sql`merge_method IN ('merge', 'squash', 'rebase')`),
]);

export const pullTimeline = sqliteTable('pull_timeline', {
  sequence: integer('sequence').primaryKey({ autoIncrement: true }),
  pullRequestId: text('pull_request_id').notNull().references((): AnySQLiteColumn => pullRequests.id, { onDelete: 'cascade' }),
  kind: text('kind').notNull(),
  entityId: text('entity_id').notNull(),
  createdAt: text('created_at').notNull(),
}, (table) => [
  index('pull_timeline_pull_sequence_idx').on(table.pullRequestId, table.sequence),
  uniqueIndex('pull_timeline_kind_entity_id_unique').on(table.kind, table.entityId),
  check('pull_timeline_check_0', sql`kind IN ('comment', 'review', 'thread', 'event', 'reference')`),
]);

export const reviewComments = sqliteTable('review_comments', {
  id: text('id').primaryKey(),
  threadId: text('thread_id').notNull().references((): AnySQLiteColumn => reviewThreads.id, { onDelete: 'cascade' }),
  authorId: text('author_id').notNull().references((): AnySQLiteColumn => users.id),
  body: text('body').notNull(),
  createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  deletedAt: text('deleted_at'),
}, (table) => [
  index('comments_by_thread').on(table.threadId, table.createdAt),
]);

export const reviewThreads = sqliteTable('review_threads', {
  id: text('id').primaryKey(),
  pullRequestId: text('pull_request_id').notNull().references((): AnySQLiteColumn => pullRequests.id, { onDelete: 'cascade' }),
  path: text('path').notNull(),
  side: text('side').notNull(),
  line: integer('line').notNull(),
  resolvedBy: text('resolved_by').references((): AnySQLiteColumn => users.id),
  resolvedAt: text('resolved_at'),
  createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  commitId: text('commit_id'),
  startSide: text('start_side'),
  startLine: integer('start_line'),
}, (table) => [
  index('review_threads_by_pull_commit').on(table.pullRequestId, table.commitId, table.createdAt),
  check('review_threads_check_0', sql`side IN ('old', 'new')`),
  check('review_threads_check_1', sql`start_side IN ('old', 'new')`),
]);
