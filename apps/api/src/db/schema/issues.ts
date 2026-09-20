import { sqliteTable, integer, text, primaryKey, index, uniqueIndex, check } from 'drizzle-orm/sqlite-core';
import type { AnySQLiteColumn } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { users } from './identity';
import { repositories, repositoryLabels } from './repositories';
import { pullRequests } from './reviews';

export const issues = sqliteTable('issues', {
  id: text('id').primaryKey(),
  repositoryId: text('repository_id').notNull().references((): AnySQLiteColumn => repositories.id, { onDelete: 'cascade' }),
  number: integer('number').notNull(),
  title: text('title').notNull(),
  body: text('body').notNull().default(sql`''`),
  authorId: text('author_id').notNull().references((): AnySQLiteColumn => users.id),
  state: text('state').notNull().default(sql`'open'`),
  closedBy: text('closed_by').references((): AnySQLiteColumn => users.id),
  closedAt: text('closed_at'),
  lockedAt: text('locked_at'),
  lockedBy: text('locked_by').references((): AnySQLiteColumn => users.id),
  createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index('issues_by_author').on(table.authorId, sql`${table.updatedAt} COLLATE BINARY DESC`),
  index('issues_by_state').on(table.repositoryId, table.state, sql`${table.updatedAt} COLLATE BINARY DESC`, sql`${table.id} COLLATE BINARY DESC`),
  uniqueIndex('issues_repository_id_number_unique').on(table.repositoryId, table.number),
  check('issues_check_0', sql`state IN ('open', 'closed')`),
]);

export const issueAssignees = sqliteTable('issue_assignees', {
  issueId: text('issue_id').notNull().references((): AnySQLiteColumn => issues.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references((): AnySQLiteColumn => users.id, { onDelete: 'cascade' }),
}, (table) => [
  primaryKey({ columns: [table.issueId, table.userId] }),
  index('issue_assignees_user').on(table.userId, table.issueId),
]);

export const issueComments = sqliteTable('issue_comments', {
  id: text('id').primaryKey(),
  issueId: text('issue_id').notNull().references((): AnySQLiteColumn => issues.id, { onDelete: 'cascade' }),
  authorId: text('author_id').notNull().references((): AnySQLiteColumn => users.id),
  body: text('body').notNull(),
  createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  deletedAt: text('deleted_at'),
  parentId: text('parent_id').references((): AnySQLiteColumn => issueComments.id),
  replyToId: text('reply_to_id').references((): AnySQLiteColumn => issueComments.id),
}, (table) => [
  index('issue_comments_parent').on(table.parentId, table.createdAt, table.id),
  index('issue_comments_issue_created').on(table.issueId, table.createdAt, table.id),
]);

export const issueEvents = sqliteTable('issue_events', {
  id: text('id').primaryKey(),
  issueId: text('issue_id').notNull().references((): AnySQLiteColumn => issues.id, { onDelete: 'cascade' }),
  actorId: text('actor_id').notNull().references((): AnySQLiteColumn => users.id),
  kind: text('kind').notNull(),
  details: text('details').notNull().default(sql`'{}'`),
  createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index('issue_events_issue_created').on(table.issueId, table.createdAt, table.id),
]);

export const issueLabels = sqliteTable('issue_labels', {
  issueId: text('issue_id').notNull().references((): AnySQLiteColumn => issues.id, { onDelete: 'cascade' }),
  labelId: text('label_id').notNull().references((): AnySQLiteColumn => repositoryLabels.id, { onDelete: 'cascade' }),
}, (table) => [
  primaryKey({ columns: [table.issueId, table.labelId] }),
  index('issue_labels_label').on(table.labelId, table.issueId),
]);

export const issueTimeline = sqliteTable('issue_timeline', {
  sequence: integer('sequence').primaryKey({ autoIncrement: true }),
  issueId: text('issue_id').notNull().references((): AnySQLiteColumn => issues.id, { onDelete: 'cascade' }),
  kind: text('kind').notNull(),
  entityId: text('entity_id').notNull(),
  createdAt: text('created_at').notNull(),
}, (table) => [
  index('issue_timeline_issue_sequence').on(table.issueId, table.sequence),
  uniqueIndex('issue_timeline_kind_entity_id_unique').on(table.kind, table.entityId),
  check('issue_timeline_check_0', sql`kind IN ('comment', 'event', 'reference')`),
]);

export const inboxItemStates = sqliteTable('inbox_item_states', {
  userId: text('user_id').notNull().references((): AnySQLiteColumn => users.id, { onDelete: 'cascade' }),
  itemKey: text('item_key').notNull(),
  readAt: text('read_at'),
  doneAt: text('done_at'),
  updatedAt: text('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  primaryKey({ columns: [table.userId, table.itemKey] }),
  index('inbox_item_states_by_user').on(table.userId, table.doneAt, table.readAt),
]);

export const contentMentions = sqliteTable('content_mentions', {
  userId: text('user_id').notNull().references((): AnySQLiteColumn => users.id, { onDelete: 'cascade' }),
  actorId: text('actor_id').notNull().references((): AnySQLiteColumn => users.id),
  sourceIssueId: text('source_issue_id').references((): AnySQLiteColumn => issues.id, { onDelete: 'cascade' }),
  sourcePullId: text('source_pull_id').references((): AnySQLiteColumn => pullRequests.id, { onDelete: 'cascade' }),
  contentKind: text('content_kind').notNull(),
  contentId: text('content_id').notNull(),
  createdAt: text('created_at').notNull(),
}, (table) => [
  primaryKey({ columns: [table.userId, table.contentKind, table.contentId] }),
  index('content_mentions_by_pull').on(table.sourcePullId, sql`${table.createdAt} COLLATE BINARY DESC`) .where(sql`source_pull_id IS NOT NULL`),
  index('content_mentions_by_issue').on(table.sourceIssueId, sql`${table.createdAt} COLLATE BINARY DESC`) .where(sql`source_issue_id IS NOT NULL`),
  index('content_mentions_by_user').on(table.userId, sql`${table.createdAt} COLLATE BINARY DESC`),
  check('content_mentions_check_0', sql`content_kind IN ('issue_body','issue_comment','pull_body','pull_comment','pull_review','review_comment')`),
  check('content_mentions_check_1', sql`(source_issue_id IS NOT NULL) != (source_pull_id IS NOT NULL)`),
]);

export const workItemReferences = sqliteTable('work_item_references', {
  id: text('id').primaryKey(),
  sourceIssueId: text('source_issue_id').references((): AnySQLiteColumn => issues.id, { onDelete: 'cascade' }),
  sourcePullId: text('source_pull_id').references((): AnySQLiteColumn => pullRequests.id, { onDelete: 'cascade' }),
  sourceContentKind: text('source_content_kind').notNull(),
  sourceContentId: text('source_content_id').notNull(),
  targetIssueId: text('target_issue_id').references((): AnySQLiteColumn => issues.id, { onDelete: 'cascade' }),
  targetPullId: text('target_pull_id').references((): AnySQLiteColumn => pullRequests.id, { onDelete: 'cascade' }),
  closesTarget: integer('closes_target').notNull().default(sql`0`),
  createdBy: text('created_by').notNull().references((): AnySQLiteColumn => users.id),
  createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex('work_item_references_pull_target').on(table.sourceContentKind, table.sourceContentId, table.targetPullId) .where(sql`target_pull_id IS NOT NULL`),
  uniqueIndex('work_item_references_issue_target').on(table.sourceContentKind, table.sourceContentId, table.targetIssueId) .where(sql`target_issue_id IS NOT NULL`),
  index('work_item_references_content').on(table.sourceContentKind, table.sourceContentId),
  index('work_item_references_target_pull').on(table.targetPullId),
  index('work_item_references_target_issue').on(table.targetIssueId),
  index('work_item_references_source_pull').on(table.sourcePullId),
  index('work_item_references_source_issue').on(table.sourceIssueId),
  check('work_item_references_check_0', sql`source_content_kind IN ('body', 'comment')`),
  check('work_item_references_check_1', sql`closes_target IN (0, 1)`),
  check('work_item_references_check_2', sql`(source_issue_id IS NOT NULL) != (source_pull_id IS NOT NULL)`),
  check('work_item_references_check_3', sql`(target_issue_id IS NOT NULL) != (target_pull_id IS NOT NULL)`),
]);

export const issueConclusions = sqliteTable('issue_conclusions', {
  issueId: text('issue_id').primaryKey().references((): AnySQLiteColumn => issues.id, { onDelete: 'cascade' }),
  body: text('body').notNull(),
  commentId: text('comment_id').references((): AnySQLiteColumn => issueComments.id, { onDelete: 'set null' }),
  authorId: text('author_id').notNull().references((): AnySQLiteColumn => users.id),
  updatedAt: text('updated_at').notNull(),
});

export const issueParticipants = sqliteTable('issue_participants', {
  issueId: text('issue_id').notNull().references((): AnySQLiteColumn => issues.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references((): AnySQLiteColumn => users.id, { onDelete: 'cascade' }),
  following: integer('following').notNull().default(sql`0`),
  lastReadSequence: integer('last_read_sequence').notNull().default(sql`0`),
}, (table) => [
  primaryKey({ columns: [table.issueId, table.userId] }),
  index('issue_participants_following').on(table.userId, table.following, table.issueId),
  check('issue_participants_check_0', sql`following IN (0,1)`),
]);

export const issuePullLinks = sqliteTable('issue_pull_links', {
  issueId: text('issue_id').notNull().references((): AnySQLiteColumn => issues.id, { onDelete: 'cascade' }),
  pullRequestId: text('pull_request_id').notNull().references((): AnySQLiteColumn => pullRequests.id, { onDelete: 'cascade' }),
  createdBy: text('created_by').notNull().references((): AnySQLiteColumn => users.id),
  createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  primaryKey({ columns: [table.issueId, table.pullRequestId] }),
  index('issue_pull_links_by_pull').on(table.pullRequestId),
]);
