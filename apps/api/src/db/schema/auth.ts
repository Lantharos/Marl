import { sqliteTable, integer, text, index, uniqueIndex } from 'drizzle-orm/sqlite-core';
import type { AnySQLiteColumn } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { nocaseText } from './types';

export const authAccount = sqliteTable('auth_account', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references((): AnySQLiteColumn => authUser.id, { onDelete: 'cascade' }),
  accountId: text('account_id').notNull(),
  providerId: text('provider_id').notNull(),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  accessTokenExpiresAt: integer('access_token_expires_at', { mode: 'timestamp_ms' }),
  refreshTokenExpiresAt: integer('refresh_token_expires_at', { mode: 'timestamp_ms' }),
  scope: text('scope'),
  idToken: text('id_token'),
  password: text('password'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
}, (table) => [
  index('auth_accounts_by_user').on(table.userId, table.providerId),
  uniqueIndex('auth_account_provider_account_unique').on(table.providerId, table.accountId),
]);

export const authPasskey = sqliteTable('auth_passkey', {
  id: text('id').primaryKey(),
  name: text('name'),
  publicKey: text('public_key').notNull(),
  userId: text('user_id').notNull().references((): AnySQLiteColumn => authUser.id, { onDelete: 'cascade' }),
  credentialID: text('credential_id').notNull(),
  counter: integer('counter').notNull(),
  deviceType: text('device_type').notNull(),
  backedUp: integer('backed_up', { mode: 'boolean' }).notNull(),
  transports: text('transports'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }),
  aaguid: text('aaguid'),
}, (table) => [
  index('auth_passkeys_by_user').on(table.userId, sql`${table.createdAt} COLLATE BINARY DESC`),
  uniqueIndex('auth_passkey_credential_id_unique').on(table.credentialID),
]);

export const authRateLimit = sqliteTable('auth_rate_limit', {
  id: text('id').primaryKey(),
  key: text('key').notNull(),
  count: integer('count').notNull(),
  lastRequest: integer('last_request').notNull(),
}, (table) => [
  uniqueIndex('auth_rate_limit_key_unique').on(table.key),
]);

export const authSession = sqliteTable('auth_session', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references((): AnySQLiteColumn => authUser.id, { onDelete: 'cascade' }),
  token: text('token').notNull(),
  expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  deviceId: text('device_id'),
}, (table) => [
  index('auth_sessions_by_user').on(table.userId, table.expiresAt),
  uniqueIndex('auth_sessions_by_device').on(table.userId, table.deviceId) .where(sql`device_id IS NOT NULL`),
  uniqueIndex('auth_session_token_unique').on(table.token),
]);

export const authTwoFactor = sqliteTable('auth_two_factor', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references((): AnySQLiteColumn => authUser.id, { onDelete: 'cascade' }),
  secret: text('secret').notNull(),
  backupCodes: text('backup_codes').notNull(),
  verified: integer('verified', { mode: 'boolean' }).notNull().default(sql`0`),
  failedVerificationCount: integer('failed_verification_count').notNull().default(sql`0`),
  lockedUntil: integer('locked_until', { mode: 'timestamp_ms' }),
}, (table) => [
  uniqueIndex('auth_two_factor_by_user').on(table.userId),
]);

export const authUser = sqliteTable('auth_user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: nocaseText('email').notNull(),
  emailVerified: integer('email_verified', { mode: 'boolean' }).notNull().default(sql`0`),
  image: text('image'),
  twoFactorEnabled: integer('two_factor_enabled', { mode: 'boolean' }).notNull().default(sql`0`),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  username: text('username'),
  displayUsername: text('display_username'),
}, (table) => [
  uniqueIndex('auth_user_username_unique').on(sql`${table.username} COLLATE NOCASE`) .where(sql`username IS NOT NULL`),
  uniqueIndex('auth_user_email_unique').on(sql`${table.email} COLLATE NOCASE`),
]);

export const authVerification = sqliteTable('auth_verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
}, (table) => [
  index('auth_verifications_by_identifier').on(table.identifier, table.expiresAt),
]);
