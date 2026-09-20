import { sqliteTable, integer, text, primaryKey, foreignKey, index, uniqueIndex, check } from 'drizzle-orm/sqlite-core';
import type { AnySQLiteColumn } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { organizations } from './organizations';
import { users } from './identity';
import { repositories } from './repositories';
import { pullRequests } from './reviews';

export const artifactUploadParts = sqliteTable('artifact_upload_parts', {
  uploadId: text('upload_id').notNull().references((): AnySQLiteColumn => artifactUploads.id, { onDelete: 'cascade' }),
  partNumber: integer('part_number').notNull(),
  etag: text('etag').notNull(),
  byteSize: integer('byte_size').notNull(),
}, (table) => [
  primaryKey({ columns: [table.uploadId, table.partNumber] }),
]);

export const artifactUploads = sqliteTable('artifact_uploads', {
  id: text('id').primaryKey(),
  jobId: text('job_id').notNull().references((): AnySQLiteColumn => jobs.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  objectKey: text('object_key').notNull(),
  multipartUploadId: text('multipart_upload_id').notNull(),
  expectedSize: integer('expected_size').notNull(),
  contentType: text('content_type').notNull(),
  state: text('state').notNull().default(sql`'uploading'`),
  expiresAt: text('expires_at').notNull(),
  completedAt: text('completed_at'),
  createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index('artifact_uploads_by_expiry').on(table.state, table.expiresAt),
  uniqueIndex('artifact_uploads_job_id_name_unique').on(table.jobId, table.name),
  check('artifact_uploads_check_0', sql`state IN ('uploading', 'completed')`),
]);

export const artifacts = sqliteTable('artifacts', {
  id: text('id').primaryKey(),
  jobId: text('job_id').notNull().references((): AnySQLiteColumn => jobs.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  objectKey: text('object_key').notNull(),
  byteSize: integer('byte_size').notNull(),
  contentType: text('content_type').notNull().default(sql`'application/octet-stream'`),
  createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex('artifacts_job_id_name_unique').on(table.jobId, table.name),
]);

export const checks = sqliteTable('checks', {
  id: text('id').primaryKey(),
  repositoryId: text('repository_id').notNull().references((): AnySQLiteColumn => repositories.id, { onDelete: 'cascade' }),
  commitId: text('commit_id').notNull(),
  producerRepositoryId: text('producer_repository_id').notNull().references((): AnySQLiteColumn => repositories.id, { onDelete: 'cascade' }),
  producerWorkflowId: text('producer_workflow_id').notNull(),
  producerJobKey: text('producer_job_key').notNull(),
  name: text('name').notNull(),
  state: text('state').notNull(),
  summary: text('summary').notNull().default(sql`''`),
  detailsUrl: text('details_url'),
  startedAt: text('started_at'),
  completedAt: text('completed_at'),
  updatedAt: text('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  foreignKey({ columns: [table.producerRepositoryId, table.producerWorkflowId], foreignColumns: [workflows.repositoryId, workflows.id] }).onDelete('cascade'),
  index('checks_by_commit').on(table.repositoryId, table.commitId, table.producerRepositoryId, sql`${table.updatedAt} COLLATE BINARY DESC`),
  uniqueIndex('checks_repository_id_commit_id_producer_repository_id_producer_workflow_id_producer_job_key_unique').on(table.repositoryId, table.commitId, table.producerRepositoryId, table.producerWorkflowId, table.producerJobKey),
  check('checks_check_0', sql`state IN ('queued', 'running', 'success', 'failure', 'canceled')`),
]);

export const ciSecrets = sqliteTable('ci_secrets', {
  id: text('id').primaryKey(),
  organizationId: text('organization_id').notNull().references((): AnySQLiteColumn => organizations.id, { onDelete: 'cascade' }),
  repositoryId: text('repository_id').references((): AnySQLiteColumn => repositories.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  ciphertext: text('ciphertext').notNull(),
  nonce: text('nonce').notNull(),
  createdBy: text('created_by').notNull().references((): AnySQLiteColumn => users.id),
  createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index('ci_secrets_scope').on(table.organizationId, table.repositoryId, table.name),
  uniqueIndex('ci_secrets_repository_name').on(table.repositoryId, table.name) .where(sql`repository_id IS NOT NULL`),
  uniqueIndex('ci_secrets_organization_name').on(table.organizationId, table.name) .where(sql`repository_id IS NULL`),
]);

export const jobLogChunks = sqliteTable('job_log_chunks', {
  id: text('id').primaryKey(),
  jobId: text('job_id').notNull().references((): AnySQLiteColumn => jobs.id, { onDelete: 'cascade' }),
  sequence: integer('sequence').notNull(),
  objectKey: text('object_key').notNull(),
  byteSize: integer('byte_size').notNull(),
  createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex('job_log_chunks_job_id_sequence_unique').on(table.jobId, table.sequence),
]);

export const jobs = sqliteTable('jobs', {
  id: text('id').primaryKey(),
  runId: text('run_id').notNull().references((): AnySQLiteColumn => runs.id, { onDelete: 'cascade' }),
  jobKey: text('job_key').notNull(),
  name: text('name').notNull(),
  checkName: text('check_name').notNull(),
  requiredLabelsJson: text('required_labels_json').notNull().default(sql`'[]'`),
  stepsJson: text('steps_json').notNull(),
  environmentJson: text('environment_json').notNull().default(sql`'{}'`),
  state: text('state').notNull().default(sql`'queued'`),
  runnerId: text('runner_id').references((): AnySQLiteColumn => runners.id),
  leaseTokenHash: text('lease_token_hash'),
  leaseExpiresAt: text('lease_expires_at'),
  cancelRequested: integer('cancel_requested').notNull().default(sql`0`),
  attempt: integer('attempt').notNull().default(sql`0`),
  exitCode: integer('exit_code'),
  createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  startedAt: text('started_at'),
  completedAt: text('completed_at'),
  artifactPathsJson: text('artifact_paths_json').notNull().default(sql`'[]'`),
  releaseJson: text('release_json'),
  runtimeJson: text('runtime_json').notNull().default(sql`'{"image":"ubuntu:24.04","timeoutMinutes":360,"services":[]}'`),
  needsJson: text('needs_json').notNull().default(sql`'[]'`),
}, (table) => [
  index('jobs_queue').on(table.state, table.createdAt),
  index('jobs_by_runner').on(table.runnerId, table.state),
  index('jobs_by_lease_expiry').on(table.state, table.leaseExpiresAt) .where(sql`state = 'running'`),
  uniqueIndex('jobs_run_id_job_key_unique').on(table.runId, table.jobKey),
  check('jobs_check_0', sql`state IN ('queued','running','success','failure','canceled')`),
]);

export const runnerEnrollmentTokens = sqliteTable('runner_enrollment_tokens', {
  id: text('id').primaryKey(),
  organizationId: text('organization_id').notNull().references((): AnySQLiteColumn => organizations.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull(),
  createdBy: text('created_by').notNull().references((): AnySQLiteColumn => users.id),
  expiresAt: text('expires_at').notNull(),
  usedAt: text('used_at'),
  createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex('runner_enrollment_tokens_token_hash_unique').on(table.tokenHash),
]);

export const runners = sqliteTable('runners', {
  id: text('id').primaryKey(),
  organizationId: text('organization_id').notNull().references((): AnySQLiteColumn => organizations.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  tokenHash: text('token_hash').notNull(),
  labelsJson: text('labels_json').notNull().default(sql`'[]'`),
  concurrency: integer('concurrency').notNull().default(sql`1`),
  platform: text('platform').notNull(),
  architecture: text('architecture').notNull(),
  version: text('version').notNull(),
  activeJobs: integer('active_jobs').notNull().default(sql`0`),
  lastSeenAt: text('last_seen_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  disabledAt: text('disabled_at'),
  createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  enrollmentId: text('enrollment_id').references((): AnySQLiteColumn => runnerEnrollmentTokens.id),
}, (table) => [
  index('runners_by_org').on(table.organizationId, sql`${table.lastSeenAt} COLLATE BINARY DESC`),
  uniqueIndex('runners_by_enrollment').on(table.enrollmentId) .where(sql`enrollment_id IS NOT NULL`),
  uniqueIndex('runners_organization_id_name_unique').on(table.organizationId, table.name),
  uniqueIndex('runners_token_hash_unique').on(table.tokenHash),
  check('runners_check_0', sql`concurrency BETWEEN 1 AND 32`),
]);

export const runs = sqliteTable('runs', {
  id: text('id').primaryKey(),
  repositoryId: text('repository_id').notNull().references((): AnySQLiteColumn => repositories.id, { onDelete: 'cascade' }),
  number: integer('number').notNull(),
  name: text('name').notNull(),
  triggerName: text('trigger_name').notNull(),
  branch: text('branch').notNull(),
  commitId: text('commit_id').notNull(),
  actorId: text('actor_id').references((): AnySQLiteColumn => users.id),
  state: text('state').notNull().default(sql`'queued'`),
  createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  startedAt: text('started_at'),
  completedAt: text('completed_at'),
  workflowId: text('workflow_id').notNull().references((): AnySQLiteColumn => workflows.id),
  cancellationReason: text('cancellation_reason'),
  approvalRequired: integer('approval_required').notNull().default(sql`0`),
  approvedBy: text('approved_by').references((): AnySQLiteColumn => users.id),
  approvedAt: text('approved_at'),
  pullRequestId: text('pull_request_id').references((): AnySQLiteColumn => pullRequests.id, { onDelete: 'set null' }),
  checkoutRepositoryId: text('checkout_repository_id').references((): AnySQLiteColumn => repositories.id, { onDelete: 'set null' }),
  untrusted: integer('untrusted').notNull().default(sql`0`),
}, (table) => [
  uniqueIndex('automatic_pull_run').on(table.pullRequestId, table.workflowId, table.commitId) .where(sql`trigger_name='pull_request'`),
  index('runs_waiting_approval').on(table.repositoryId, table.commitId) .where(sql`approval_required=1 AND state='queued'`),
  index('runs_by_workflow').on(table.workflowId, sql`${table.createdAt} COLLATE BINARY DESC`),
  index('runs_by_repository').on(table.repositoryId, sql`${table.createdAt} COLLATE BINARY DESC`),
  index('runs_active_workflow_branch').on(table.repositoryId, table.workflowId, table.branch, table.triggerName, table.state),
  uniqueIndex('runs_repository_id_number_unique').on(table.repositoryId, table.number),
  check('runs_check_0', sql`state IN ('queued','running','success','failure','canceled')`),
  check('runs_check_1', sql`cancellation_reason IN ('developer', 'superseded')`),
  check('runs_check_2', sql`approval_required IN (0,1)`),
  check('runs_check_3', sql`untrusted IN (0,1)`),
]);

export const workflows = sqliteTable('workflows', {
  id: text('id').primaryKey(),
  repositoryId: text('repository_id').notNull().references((): AnySQLiteColumn => repositories.id, { onDelete: 'cascade' }),
  branch: text('branch').notNull(),
  path: text('path').notNull(),
  name: text('name').notNull(),
  source: text('source').notNull(),
  triggersJson: text('triggers_json').notNull(),
  jobsJson: text('jobs_json'),
  status: text('status').notNull(),
  error: text('error'),
  commitId: text('commit_id').notNull(),
  active: integer('active').notNull().default(sql`1`),
  createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  supersedePushes: integer('supersede_pushes').notNull().default(sql`1`),
  triggerConfigJson: text('trigger_config_json').notNull().default(sql`'null'`),
}, (table) => [
  index('workflows_by_repository').on(table.repositoryId, table.branch, table.active, table.name),
  uniqueIndex('workflows_repository_id_id_unique').on(table.repositoryId, table.id),
  uniqueIndex('workflows_repository_id_branch_path_unique').on(table.repositoryId, table.branch, table.path),
  check('workflows_check_0', sql`source IN ('marl', 'github')`),
  check('workflows_check_1', sql`status IN ('valid', 'invalid')`),
]);
