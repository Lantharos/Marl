import { sqliteTable, integer, text, primaryKey, index, uniqueIndex, check } from 'drizzle-orm/sqlite-core';
import type { AnySQLiteColumn } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { jobs } from './automation';
import { users } from './identity';
import { repositories } from './repositories';

export const releases = sqliteTable('releases', {
  id: text('id').primaryKey(),
  repositoryId: text('repository_id').notNull().references((): AnySQLiteColumn => repositories.id, { onDelete: 'cascade' }),
  tagName: text('tag_name').notNull(),
  targetCommitId: text('target_commit_id').notNull(),
  targetBranch: text('target_branch'),
  name: text('name').notNull().default(sql`''`),
  body: text('body').notNull().default(sql`''`),
  authorId: text('author_id').notNull().references((): AnySQLiteColumn => users.id),
  sourceJobId: text('source_job_id').references((): AnySQLiteColumn => jobs.id, { onDelete: 'set null' }),
  draft: integer('draft').notNull().default(sql`1`),
  prerelease: integer('prerelease').notNull().default(sql`0`),
  latest: integer('latest').notNull().default(sql`0`),
  createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  publishedAt: text('published_at'),
}, (table) => [
  uniqueIndex('releases_latest').on(table.repositoryId) .where(sql`latest = 1`),
  index('releases_by_repository').on(table.repositoryId, table.draft, sql`${table.publishedAt} COLLATE BINARY DESC`, sql`${table.createdAt} COLLATE BINARY DESC`),
  uniqueIndex('releases_repository_id_tag_name_unique').on(table.repositoryId, table.tagName),
  uniqueIndex('releases_source_job_id_unique').on(table.sourceJobId),
  check('releases_check_0', sql`draft IN (0, 1)`),
  check('releases_check_1', sql`prerelease IN (0, 1)`),
  check('releases_check_2', sql`latest IN (0, 1)`),
  check('releases_check_3', sql`(draft = 1 AND published_at IS NULL AND latest = 0) OR (draft = 0 AND published_at IS NOT NULL)`),
  check('releases_check_4', sql`latest = 0 OR prerelease = 0`),
]);

export const releaseAssets = sqliteTable('release_assets', {
  id: text('id').primaryKey(),
  releaseId: text('release_id').notNull().references((): AnySQLiteColumn => releases.id, { onDelete: 'cascade' }),
  uploaderId: text('uploader_id').notNull().references((): AnySQLiteColumn => users.id),
  name: text('name').notNull(),
  objectKey: text('object_key').notNull(),
  byteSize: integer('byte_size').notNull(),
  contentType: text('content_type').notNull().default(sql`'application/octet-stream'`),
  downloadCount: integer('download_count').notNull().default(sql`0`),
  createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index('release_assets_by_release').on(table.releaseId, table.createdAt),
  uniqueIndex('release_assets_release_id_name_unique').on(table.releaseId, table.name),
  uniqueIndex('release_assets_object_key_unique').on(table.objectKey),
  check('release_assets_check_0', sql`byte_size >= 0`),
  check('release_assets_check_1', sql`download_count >= 0`),
]);

export const releaseAssetUploads = sqliteTable('release_asset_uploads', {
  id: text('id').primaryKey(),
  assetId: text('asset_id').notNull(),
  releaseId: text('release_id').notNull().references((): AnySQLiteColumn => releases.id, { onDelete: 'cascade' }),
  uploaderId: text('uploader_id').notNull().references((): AnySQLiteColumn => users.id),
  name: text('name').notNull(),
  objectKey: text('object_key').notNull(),
  multipartUploadId: text('multipart_upload_id').notNull(),
  expectedSize: integer('expected_size').notNull(),
  contentType: text('content_type').notNull().default(sql`'application/octet-stream'`),
  expiresAt: text('expires_at').notNull(),
  createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index('release_asset_uploads_by_expiry').on(table.expiresAt),
  uniqueIndex('release_asset_uploads_release_id_name_unique').on(table.releaseId, table.name),
  uniqueIndex('release_asset_uploads_object_key_unique').on(table.objectKey),
  uniqueIndex('release_asset_uploads_asset_id_unique').on(table.assetId),
  check('release_asset_uploads_check_0', sql`expected_size > 0`),
]);

export const releaseAssetUploadParts = sqliteTable('release_asset_upload_parts', {
  uploadId: text('upload_id').notNull().references((): AnySQLiteColumn => releaseAssetUploads.id, { onDelete: 'cascade' }),
  partNumber: integer('part_number').notNull(),
  etag: text('etag').notNull(),
  byteSize: integer('byte_size').notNull(),
}, (table) => [
  primaryKey({ columns: [table.uploadId, table.partNumber] }),
  check('release_asset_upload_parts_check_0', sql`part_number > 0`),
  check('release_asset_upload_parts_check_1', sql`byte_size > 0`),
]);
