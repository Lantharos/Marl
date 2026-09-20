import { sqliteTable, text, primaryKey, index, uniqueIndex, check } from 'drizzle-orm/sqlite-core';
import type { AnySQLiteColumn } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { nocaseText } from './types';
import { users } from './identity';

export const organizationInvitations = sqliteTable('organization_invitations', {
  id: text('id').primaryKey(),
  organizationId: text('organization_id').notNull().references((): AnySQLiteColumn => organizations.id, { onDelete: 'cascade' }),
  email: nocaseText('email').notNull(),
  role: text('role').notNull(),
  tokenHash: text('token_hash').notNull(),
  invitedBy: text('invited_by').notNull().references((): AnySQLiteColumn => users.id),
  expiresAt: text('expires_at').notNull(),
  acceptedAt: text('accepted_at'),
  revokedAt: text('revoked_at'),
  createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index('organization_invitations_by_email').on(sql`${table.email} COLLATE NOCASE`, table.expiresAt),
  uniqueIndex('organization_invitations_token_hash_unique').on(table.tokenHash),
  check('organization_invitations_check_0', sql`role IN ('admin','member')`),
]);

export const organizationMembers = sqliteTable('organization_members', {
  organizationId: text('organization_id').notNull().references((): AnySQLiteColumn => organizations.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references((): AnySQLiteColumn => users.id, { onDelete: 'cascade' }),
  role: text('role').notNull(),
  createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  primaryKey({ columns: [table.organizationId, table.userId] }),
  index('organization_members_by_user').on(table.userId, table.organizationId),
  check('organization_members_check_0', sql`role IN ('owner','admin','member')`),
]);

export const organizations = sqliteTable('organizations', {
  id: text('id').primaryKey(),
  slug: nocaseText('slug').notNull(),
  name: text('name').notNull(),
  createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  kind: text('kind').notNull().default(sql`'team'`),
  baseRepositoryRole: text('base_repository_role'),
  avatarUrl: text('avatar_url'),
  description: text('description').notNull().default(sql`''`),
  website: text('website'),
}, (table) => [
  uniqueIndex('organizations_slug_unique').on(sql`${table.slug} COLLATE NOCASE`),
  check('organizations_check_0', sql`kind IN ('personal','team')`),
  check('organizations_check_1', sql`base_repository_role IN ('read','triage','write','maintain')`),
]);

export const teamMembers = sqliteTable('team_members', {
  teamId: text('team_id').notNull().references((): AnySQLiteColumn => teams.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references((): AnySQLiteColumn => users.id, { onDelete: 'cascade' }),
  createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  primaryKey({ columns: [table.teamId, table.userId] }),
  index('team_members_by_user').on(table.userId, table.teamId),
]);

export const teams = sqliteTable('teams', {
  id: text('id').primaryKey(),
  organizationId: text('organization_id').notNull().references((): AnySQLiteColumn => organizations.id, { onDelete: 'cascade' }),
  slug: nocaseText('slug').notNull(),
  name: text('name').notNull(),
  description: text('description').notNull().default(sql`''`),
  createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index('teams_by_organization').on(table.organizationId, sql`${table.slug} COLLATE NOCASE`),
  uniqueIndex('teams_organization_id_slug_unique').on(table.organizationId, sql`${table.slug} COLLATE NOCASE`),
]);
