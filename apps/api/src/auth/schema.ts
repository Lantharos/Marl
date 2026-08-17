import { integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

const timestamps = {
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull()
};

export const user = sqliteTable('auth_user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  username: text('username').unique(),
  displayUsername: text('display_username'),
  emailVerified: integer('email_verified', { mode: 'boolean' }).notNull().default(false),
  image: text('image'),
  twoFactorEnabled: integer('two_factor_enabled', { mode: 'boolean' }).notNull().default(false),
  ...timestamps
});

export const session = sqliteTable('auth_session', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  token: text('token').notNull().unique(),
  expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  ...timestamps
});

export const account = sqliteTable('auth_account', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  accountId: text('account_id').notNull(),
  providerId: text('provider_id').notNull(),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  accessTokenExpiresAt: integer('access_token_expires_at', { mode: 'timestamp_ms' }),
  refreshTokenExpiresAt: integer('refresh_token_expires_at', { mode: 'timestamp_ms' }),
  scope: text('scope'),
  idToken: text('id_token'),
  password: text('password'),
  ...timestamps
}, (table) => [uniqueIndex('auth_account_provider_subject').on(table.providerId, table.accountId)]);

export const verification = sqliteTable('auth_verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
  ...timestamps
});

export const passkey = sqliteTable('auth_passkey', {
  id: text('id').primaryKey(),
  name: text('name'),
  publicKey: text('public_key').notNull(),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  credentialID: text('credential_id').notNull().unique(),
  counter: integer('counter').notNull(),
  deviceType: text('device_type').notNull(),
  backedUp: integer('backed_up', { mode: 'boolean' }).notNull(),
  transports: text('transports'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }),
  aaguid: text('aaguid')
});

export const twoFactor = sqliteTable('auth_two_factor', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }).unique(),
  secret: text('secret').notNull(),
  backupCodes: text('backup_codes').notNull(),
  verified: integer('verified', { mode: 'boolean' }).notNull().default(false),
  failedVerificationCount: integer('failed_verification_count').notNull().default(0),
  lockedUntil: integer('locked_until', { mode: 'timestamp_ms' })
});

export const rateLimit = sqliteTable('auth_rate_limit', {
  key: text('key').primaryKey(),
  count: integer('count').notNull(),
  lastRequest: integer('last_request').notNull()
});

export const authSchema = { user, session, account, verification, passkey, twoFactor, rateLimit };
