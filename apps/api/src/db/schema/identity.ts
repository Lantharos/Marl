import { sqliteTable, integer, text, index, uniqueIndex, check } from 'drizzle-orm/sqlite-core';
import type { AnySQLiteColumn } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { nocaseText } from './types';

export const personalAccessTokens = sqliteTable('personal_access_tokens', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references((): AnySQLiteColumn => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  tokenHash: text('token_hash').notNull(),
  tokenPrefix: text('token_prefix').notNull(),
  scopesJson: text('scopes_json').notNull(),
  repositoryIdsJson: text('repository_ids_json'),
  expiresAt: text('expires_at').notNull(),
  lastUsedAt: text('last_used_at'),
  revokedAt: text('revoked_at'),
  createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index('personal_access_tokens_by_user').on(table.userId, sql`${table.createdAt} COLLATE BINARY DESC`),
  uniqueIndex('personal_access_tokens_token_hash_unique').on(table.tokenHash),
]);

export const sshKeys = sqliteTable('ssh_keys', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references((): AnySQLiteColumn => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  publicKey: text('public_key').notNull(),
  fingerprint: text('fingerprint').notNull(),
  lastUsedAt: text('last_used_at'),
  createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index('ssh_keys_user').on(table.userId, sql`${table.createdAt} COLLATE BINARY DESC`),
  uniqueIndex('ssh_keys_fingerprint_unique').on(table.fingerprint),
]);

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  handle: nocaseText('handle').notNull(),
  displayName: text('display_name').notNull(),
  createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  email: text('email'),
  avatarUrl: text('avatar_url'),
  authUserId: text('auth_user_id'),
  bio: text('bio').notNull().default(sql`''`),
  website: text('website'),
  signingMode: text('signing_mode').notNull().default(sql`'optional'`),
}, (table) => [
  uniqueIndex('users_by_auth_user').on(table.authUserId) .where(sql`auth_user_id IS NOT NULL`),
  uniqueIndex('users_handle_unique').on(sql`${table.handle} COLLATE NOCASE`),
  check('users_check_0', sql`signing_mode IN ('optional','vigilant','firewall')`),
]);

export const userEmails = sqliteTable('user_emails', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references((): AnySQLiteColumn => users.id, { onDelete: 'cascade' }),
  email: nocaseText('email').notNull(),
  primaryEmail: integer('primary_email').notNull().default(sql`0`),
  verifiedAt: text('verified_at'),
  createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex('user_emails_primary').on(table.userId) .where(sql`primary_email = 1`),
  index('user_emails_by_user').on(table.userId, sql`${table.primaryEmail} COLLATE BINARY DESC`, table.createdAt),
  uniqueIndex('user_emails_email_unique').on(sql`${table.email} COLLATE NOCASE`),
  check('user_emails_check_0', sql`primary_email IN (0, 1)`),
]);

export const userEmailVerifications = sqliteTable('user_email_verifications', {
  userEmailId: text('user_email_id').primaryKey().references((): AnySQLiteColumn => userEmails.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull(),
  expiresAt: text('expires_at').notNull(),
  createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index('user_email_verifications_by_expiry').on(table.expiresAt),
  uniqueIndex('user_email_verifications_token_hash_unique').on(table.tokenHash),
]);
