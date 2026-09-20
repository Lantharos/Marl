CREATE TABLE `auth_account` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`account_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`access_token` text,
	`refresh_token` text,
	`access_token_expires_at` integer,
	`refresh_token_expires_at` integer,
	`scope` text,
	`id_token` text,
	`password` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `auth_user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `auth_accounts_by_user` ON `auth_account` (`user_id`,`provider_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `auth_account_provider_account_unique` ON `auth_account` (`provider_id`,`account_id`);--> statement-breakpoint
CREATE TABLE `auth_passkey` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text,
	`public_key` text NOT NULL,
	`user_id` text NOT NULL,
	`credential_id` text NOT NULL,
	`counter` integer NOT NULL,
	`device_type` text NOT NULL,
	`backed_up` integer NOT NULL,
	`transports` text,
	`created_at` integer,
	`aaguid` text,
	FOREIGN KEY (`user_id`) REFERENCES `auth_user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `auth_passkeys_by_user` ON `auth_passkey` (`user_id`,"created_at" COLLATE BINARY DESC);--> statement-breakpoint
CREATE UNIQUE INDEX `auth_passkey_credential_id_unique` ON `auth_passkey` (`credential_id`);--> statement-breakpoint
CREATE TABLE `auth_rate_limit` (
	`id` text PRIMARY KEY NOT NULL,
	`key` text NOT NULL,
	`count` integer NOT NULL,
	`last_request` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `auth_rate_limit_key_unique` ON `auth_rate_limit` (`key`);--> statement-breakpoint
CREATE TABLE `auth_session` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`token` text NOT NULL,
	`expires_at` integer NOT NULL,
	`ip_address` text,
	`user_agent` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`device_id` text,
	FOREIGN KEY (`user_id`) REFERENCES `auth_user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `auth_sessions_by_user` ON `auth_session` (`user_id`,`expires_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `auth_sessions_by_device` ON `auth_session` (`user_id`,`device_id`) WHERE device_id IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `auth_session_token_unique` ON `auth_session` (`token`);--> statement-breakpoint
CREATE TABLE `auth_two_factor` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`secret` text NOT NULL,
	`backup_codes` text NOT NULL,
	`verified` integer DEFAULT 0 NOT NULL,
	`failed_verification_count` integer DEFAULT 0 NOT NULL,
	`locked_until` integer,
	FOREIGN KEY (`user_id`) REFERENCES `auth_user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `auth_two_factor_by_user` ON `auth_two_factor` (`user_id`);--> statement-breakpoint
CREATE TABLE `auth_user` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text COLLATE NOCASE NOT NULL,
	`email_verified` integer DEFAULT 0 NOT NULL,
	`image` text,
	`two_factor_enabled` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`username` text,
	`display_username` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `auth_user_username_unique` ON `auth_user` ("username" COLLATE NOCASE) WHERE username IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `auth_user_email_unique` ON `auth_user` ("email" COLLATE NOCASE);--> statement-breakpoint
CREATE TABLE `auth_verification` (
	`id` text PRIMARY KEY NOT NULL,
	`identifier` text NOT NULL,
	`value` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `auth_verifications_by_identifier` ON `auth_verification` (`identifier`,`expires_at`);--> statement-breakpoint
CREATE TABLE `artifact_upload_parts` (
	`upload_id` text NOT NULL,
	`part_number` integer NOT NULL,
	`etag` text NOT NULL,
	`byte_size` integer NOT NULL,
	PRIMARY KEY(`upload_id`, `part_number`),
	FOREIGN KEY (`upload_id`) REFERENCES `artifact_uploads`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `artifact_uploads` (
	`id` text PRIMARY KEY NOT NULL,
	`job_id` text NOT NULL,
	`name` text NOT NULL,
	`object_key` text NOT NULL,
	`multipart_upload_id` text NOT NULL,
	`expected_size` integer NOT NULL,
	`content_type` text NOT NULL,
	`state` text DEFAULT 'uploading' NOT NULL,
	`expires_at` text NOT NULL,
	`completed_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`job_id`) REFERENCES `jobs`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "artifact_uploads_check_0" CHECK(state IN ('uploading', 'completed'))
);
--> statement-breakpoint
CREATE INDEX `artifact_uploads_by_expiry` ON `artifact_uploads` (`state`,`expires_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `artifact_uploads_job_id_name_unique` ON `artifact_uploads` (`job_id`,`name`);--> statement-breakpoint
CREATE TABLE `artifacts` (
	`id` text PRIMARY KEY NOT NULL,
	`job_id` text NOT NULL,
	`name` text NOT NULL,
	`object_key` text NOT NULL,
	`byte_size` integer NOT NULL,
	`content_type` text DEFAULT 'application/octet-stream' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`job_id`) REFERENCES `jobs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `artifacts_job_id_name_unique` ON `artifacts` (`job_id`,`name`);--> statement-breakpoint
CREATE TABLE `checks` (
	`id` text PRIMARY KEY NOT NULL,
	`repository_id` text NOT NULL,
	`commit_id` text NOT NULL,
	`producer_repository_id` text NOT NULL,
	`producer_workflow_id` text NOT NULL,
	`producer_job_key` text NOT NULL,
	`name` text NOT NULL,
	`state` text NOT NULL,
	`summary` text DEFAULT '' NOT NULL,
	`details_url` text,
	`started_at` text,
	`completed_at` text,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`repository_id`) REFERENCES `repositories`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`producer_repository_id`) REFERENCES `repositories`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`producer_repository_id`,`producer_workflow_id`) REFERENCES `workflows`(`repository_id`,`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "checks_check_0" CHECK(state IN ('queued', 'running', 'success', 'failure', 'canceled'))
);
--> statement-breakpoint
CREATE INDEX `checks_by_commit` ON `checks` (`repository_id`,`commit_id`,`producer_repository_id`,"updated_at" COLLATE BINARY DESC);--> statement-breakpoint
CREATE UNIQUE INDEX `checks_repository_id_commit_id_producer_repository_id_producer_workflow_id_producer_job_key_unique` ON `checks` (`repository_id`,`commit_id`,`producer_repository_id`,`producer_workflow_id`,`producer_job_key`);--> statement-breakpoint
CREATE TABLE `ci_secrets` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`repository_id` text,
	`name` text NOT NULL,
	`ciphertext` text NOT NULL,
	`nonce` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`repository_id`) REFERENCES `repositories`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `ci_secrets_scope` ON `ci_secrets` (`organization_id`,`repository_id`,`name`);--> statement-breakpoint
CREATE UNIQUE INDEX `ci_secrets_repository_name` ON `ci_secrets` (`repository_id`,`name`) WHERE repository_id IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `ci_secrets_organization_name` ON `ci_secrets` (`organization_id`,`name`) WHERE repository_id IS NULL;--> statement-breakpoint
CREATE TABLE `job_log_chunks` (
	`id` text PRIMARY KEY NOT NULL,
	`job_id` text NOT NULL,
	`sequence` integer NOT NULL,
	`object_key` text NOT NULL,
	`byte_size` integer NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`job_id`) REFERENCES `jobs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `job_log_chunks_job_id_sequence_unique` ON `job_log_chunks` (`job_id`,`sequence`);--> statement-breakpoint
CREATE TABLE `jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`run_id` text NOT NULL,
	`job_key` text NOT NULL,
	`name` text NOT NULL,
	`check_name` text NOT NULL,
	`required_labels_json` text DEFAULT '[]' NOT NULL,
	`steps_json` text NOT NULL,
	`environment_json` text DEFAULT '{}' NOT NULL,
	`state` text DEFAULT 'queued' NOT NULL,
	`runner_id` text,
	`lease_token_hash` text,
	`lease_expires_at` text,
	`cancel_requested` integer DEFAULT 0 NOT NULL,
	`attempt` integer DEFAULT 0 NOT NULL,
	`exit_code` integer,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`started_at` text,
	`completed_at` text,
	`artifact_paths_json` text DEFAULT '[]' NOT NULL,
	`release_json` text,
	`runtime_json` text DEFAULT '{"image":"ubuntu:24.04","timeoutMinutes":360,"services":[]}' NOT NULL,
	`needs_json` text DEFAULT '[]' NOT NULL,
	FOREIGN KEY (`run_id`) REFERENCES `runs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`runner_id`) REFERENCES `runners`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "jobs_check_0" CHECK(state IN ('queued','running','success','failure','canceled'))
);
--> statement-breakpoint
CREATE INDEX `jobs_queue` ON `jobs` (`state`,`created_at`);--> statement-breakpoint
CREATE INDEX `jobs_by_runner` ON `jobs` (`runner_id`,`state`);--> statement-breakpoint
CREATE INDEX `jobs_by_lease_expiry` ON `jobs` (`state`,`lease_expires_at`) WHERE state = 'running';--> statement-breakpoint
CREATE UNIQUE INDEX `jobs_run_id_job_key_unique` ON `jobs` (`run_id`,`job_key`);--> statement-breakpoint
CREATE TABLE `runner_enrollment_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`created_by` text NOT NULL,
	`expires_at` text NOT NULL,
	`used_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `runner_enrollment_tokens_token_hash_unique` ON `runner_enrollment_tokens` (`token_hash`);--> statement-breakpoint
CREATE TABLE `runners` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`name` text NOT NULL,
	`token_hash` text NOT NULL,
	`labels_json` text DEFAULT '[]' NOT NULL,
	`concurrency` integer DEFAULT 1 NOT NULL,
	`platform` text NOT NULL,
	`architecture` text NOT NULL,
	`version` text NOT NULL,
	`active_jobs` integer DEFAULT 0 NOT NULL,
	`last_seen_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`disabled_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`enrollment_id` text,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`enrollment_id`) REFERENCES `runner_enrollment_tokens`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "runners_check_0" CHECK(concurrency BETWEEN 1 AND 32)
);
--> statement-breakpoint
CREATE INDEX `runners_by_org` ON `runners` (`organization_id`,"last_seen_at" COLLATE BINARY DESC);--> statement-breakpoint
CREATE UNIQUE INDEX `runners_by_enrollment` ON `runners` (`enrollment_id`) WHERE enrollment_id IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `runners_organization_id_name_unique` ON `runners` (`organization_id`,`name`);--> statement-breakpoint
CREATE UNIQUE INDEX `runners_token_hash_unique` ON `runners` (`token_hash`);--> statement-breakpoint
CREATE TABLE `runs` (
	`id` text PRIMARY KEY NOT NULL,
	`repository_id` text NOT NULL,
	`number` integer NOT NULL,
	`name` text NOT NULL,
	`trigger_name` text NOT NULL,
	`branch` text NOT NULL,
	`commit_id` text NOT NULL,
	`actor_id` text,
	`state` text DEFAULT 'queued' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`started_at` text,
	`completed_at` text,
	`workflow_id` text NOT NULL,
	`cancellation_reason` text,
	`approval_required` integer DEFAULT 0 NOT NULL,
	`approved_by` text,
	`approved_at` text,
	`pull_request_id` text,
	`checkout_repository_id` text,
	`untrusted` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`repository_id`) REFERENCES `repositories`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`workflow_id`) REFERENCES `workflows`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`approved_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`pull_request_id`) REFERENCES `pull_requests`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`checkout_repository_id`) REFERENCES `repositories`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "runs_check_0" CHECK(state IN ('queued','running','success','failure','canceled')),
	CONSTRAINT "runs_check_1" CHECK(cancellation_reason IN ('developer', 'superseded')),
	CONSTRAINT "runs_check_2" CHECK(approval_required IN (0,1)),
	CONSTRAINT "runs_check_3" CHECK(untrusted IN (0,1))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `automatic_pull_run` ON `runs` (`pull_request_id`,`workflow_id`,`commit_id`) WHERE trigger_name='pull_request';--> statement-breakpoint
CREATE INDEX `runs_waiting_approval` ON `runs` (`repository_id`,`commit_id`) WHERE approval_required=1 AND state='queued';--> statement-breakpoint
CREATE INDEX `runs_by_workflow` ON `runs` (`workflow_id`,"created_at" COLLATE BINARY DESC);--> statement-breakpoint
CREATE INDEX `runs_by_repository` ON `runs` (`repository_id`,"created_at" COLLATE BINARY DESC);--> statement-breakpoint
CREATE INDEX `runs_active_workflow_branch` ON `runs` (`repository_id`,`workflow_id`,`branch`,`trigger_name`,`state`);--> statement-breakpoint
CREATE UNIQUE INDEX `runs_repository_id_number_unique` ON `runs` (`repository_id`,`number`);--> statement-breakpoint
CREATE TABLE `workflows` (
	`id` text PRIMARY KEY NOT NULL,
	`repository_id` text NOT NULL,
	`branch` text NOT NULL,
	`path` text NOT NULL,
	`name` text NOT NULL,
	`source` text NOT NULL,
	`triggers_json` text NOT NULL,
	`jobs_json` text,
	`status` text NOT NULL,
	`error` text,
	`commit_id` text NOT NULL,
	`active` integer DEFAULT 1 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`supersede_pushes` integer DEFAULT 1 NOT NULL,
	`trigger_config_json` text DEFAULT 'null' NOT NULL,
	FOREIGN KEY (`repository_id`) REFERENCES `repositories`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "workflows_check_0" CHECK(source IN ('marl', 'github')),
	CONSTRAINT "workflows_check_1" CHECK(status IN ('valid', 'invalid'))
);
--> statement-breakpoint
CREATE INDEX `workflows_by_repository` ON `workflows` (`repository_id`,`branch`,`active`,`name`);--> statement-breakpoint
CREATE UNIQUE INDEX `workflows_repository_id_id_unique` ON `workflows` (`repository_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `workflows_repository_id_branch_path_unique` ON `workflows` (`repository_id`,`branch`,`path`);--> statement-breakpoint
CREATE TABLE `branch_rules` (
	`repository_id` text NOT NULL,
	`pattern` text NOT NULL,
	`required_approvals` integer DEFAULT 0 NOT NULL,
	`required_checks_json` text DEFAULT '[]' NOT NULL,
	`require_conversations` integer DEFAULT 1 NOT NULL,
	`allowed_merge_methods_json` text DEFAULT '["merge","squash","rebase"]' NOT NULL,
	`updated_by` text NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`carry_approvals_forward` integer DEFAULT 0 NOT NULL,
	`allow_author_merge` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`repository_id`, `pattern`),
	FOREIGN KEY (`repository_id`) REFERENCES `repositories`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`updated_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "branch_rules_check_0" CHECK(required_approvals BETWEEN 0 AND 10),
	CONSTRAINT "branch_rules_check_1" CHECK(require_conversations IN (0, 1)),
	CONSTRAINT "branch_rules_check_2" CHECK(carry_approvals_forward IN (0,1)),
	CONSTRAINT "branch_rules_check_3" CHECK(allow_author_merge IN (0,1))
);
--> statement-breakpoint
CREATE TABLE `branches` (
	`repository_id` text NOT NULL,
	`name` text NOT NULL,
	`commit_id` text NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`index_version` text DEFAULT '' NOT NULL,
	PRIMARY KEY(`repository_id`, `name`),
	FOREIGN KEY (`repository_id`) REFERENCES `repositories`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`repository_id`,`commit_id`) REFERENCES `commits`(`repository_id`,`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `branches_by_index_version` ON `branches` (`repository_id`,`index_version`);--> statement-breakpoint
CREATE TABLE `commit_changes` (
	`repository_id` text NOT NULL,
	`commit_id` text NOT NULL,
	`path` text NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`repository_id`, `commit_id`, `path`),
	FOREIGN KEY (`repository_id`,`commit_id`) REFERENCES `commits`(`repository_id`,`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `commit_changes_by_position` ON `commit_changes` (`repository_id`,`path`,`position`);--> statement-breakpoint
CREATE INDEX `commit_changes_by_path` ON `commit_changes` (`repository_id`,`path`,`commit_id`);--> statement-breakpoint
CREATE TABLE `commits` (
	`id` text NOT NULL,
	`repository_id` text NOT NULL,
	`title` text NOT NULL,
	`author_name` text NOT NULL,
	`author_email` text NOT NULL,
	`authored_at` text NOT NULL,
	`parent_ids` text DEFAULT '[]' NOT NULL,
	`tree_id` text NOT NULL,
	`signature_status` text DEFAULT 'unverified' NOT NULL,
	`signature_signer_id` text,
	`signature_key_fingerprint` text,
	PRIMARY KEY(`repository_id`, `id`),
	FOREIGN KEY (`repository_id`) REFERENCES `repositories`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`signature_signer_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "commits_check_0" CHECK(signature_status IN ('verified', 'unverified', 'invalid'))
);
--> statement-breakpoint
CREATE INDEX `commits_signature_signer` ON `commits` (`signature_signer_id`,`signature_key_fingerprint`);--> statement-breakpoint
CREATE INDEX `commits_by_time` ON `commits` (`repository_id`,"authored_at" COLLATE BINARY DESC);--> statement-breakpoint
CREATE TABLE `indexed_commit_changes` (
	`repository_id` text NOT NULL,
	`commit_id` text NOT NULL,
	PRIMARY KEY(`repository_id`, `commit_id`),
	FOREIGN KEY (`repository_id`,`commit_id`) REFERENCES `commits`(`repository_id`,`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `personal_access_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`token_hash` text NOT NULL,
	`token_prefix` text NOT NULL,
	`scopes_json` text NOT NULL,
	`repository_ids_json` text,
	`expires_at` text NOT NULL,
	`last_used_at` text,
	`revoked_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `personal_access_tokens_by_user` ON `personal_access_tokens` (`user_id`,"created_at" COLLATE BINARY DESC);--> statement-breakpoint
CREATE UNIQUE INDEX `personal_access_tokens_token_hash_unique` ON `personal_access_tokens` (`token_hash`);--> statement-breakpoint
CREATE TABLE `ssh_keys` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`public_key` text NOT NULL,
	`fingerprint` text NOT NULL,
	`last_used_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `ssh_keys_user` ON `ssh_keys` (`user_id`,"created_at" COLLATE BINARY DESC);--> statement-breakpoint
CREATE UNIQUE INDEX `ssh_keys_fingerprint_unique` ON `ssh_keys` (`fingerprint`);--> statement-breakpoint
CREATE TABLE `user_email_verifications` (
	`user_email_id` text PRIMARY KEY NOT NULL,
	`token_hash` text NOT NULL,
	`expires_at` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_email_id`) REFERENCES `user_emails`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `user_email_verifications_by_expiry` ON `user_email_verifications` (`expires_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `user_email_verifications_token_hash_unique` ON `user_email_verifications` (`token_hash`);--> statement-breakpoint
CREATE TABLE `user_emails` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`email` text COLLATE NOCASE NOT NULL,
	`primary_email` integer DEFAULT 0 NOT NULL,
	`verified_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "user_emails_check_0" CHECK(primary_email IN (0, 1))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_emails_primary` ON `user_emails` (`user_id`) WHERE primary_email = 1;--> statement-breakpoint
CREATE INDEX `user_emails_by_user` ON `user_emails` (`user_id`,"primary_email" COLLATE BINARY DESC,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `user_emails_email_unique` ON `user_emails` ("email" COLLATE NOCASE);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`handle` text COLLATE NOCASE NOT NULL,
	`display_name` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`email` text,
	`avatar_url` text,
	`auth_user_id` text,
	`bio` text DEFAULT '' NOT NULL,
	`website` text,
	`signing_mode` text DEFAULT 'optional' NOT NULL,
	CONSTRAINT "users_check_0" CHECK(signing_mode IN ('optional','vigilant','firewall'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_by_auth_user` ON `users` (`auth_user_id`) WHERE auth_user_id IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `users_handle_unique` ON `users` ("handle" COLLATE NOCASE);--> statement-breakpoint
CREATE TABLE `content_mentions` (
	`user_id` text NOT NULL,
	`actor_id` text NOT NULL,
	`source_issue_id` text,
	`source_pull_id` text,
	`content_kind` text NOT NULL,
	`content_id` text NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`user_id`, `content_kind`, `content_id`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`source_issue_id`) REFERENCES `issues`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`source_pull_id`) REFERENCES `pull_requests`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "content_mentions_check_0" CHECK(content_kind IN ('issue_body','issue_comment','pull_body','pull_comment','pull_review','review_comment')),
	CONSTRAINT "content_mentions_check_1" CHECK((source_issue_id IS NOT NULL) != (source_pull_id IS NOT NULL))
);
--> statement-breakpoint
CREATE INDEX `content_mentions_by_pull` ON `content_mentions` (`source_pull_id`,"created_at" COLLATE BINARY DESC) WHERE source_pull_id IS NOT NULL;--> statement-breakpoint
CREATE INDEX `content_mentions_by_issue` ON `content_mentions` (`source_issue_id`,"created_at" COLLATE BINARY DESC) WHERE source_issue_id IS NOT NULL;--> statement-breakpoint
CREATE INDEX `content_mentions_by_user` ON `content_mentions` (`user_id`,"created_at" COLLATE BINARY DESC);--> statement-breakpoint
CREATE TABLE `inbox_item_states` (
	`user_id` text NOT NULL,
	`item_key` text NOT NULL,
	`read_at` text,
	`done_at` text,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`user_id`, `item_key`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `inbox_item_states_by_user` ON `inbox_item_states` (`user_id`,`done_at`,`read_at`);--> statement-breakpoint
CREATE TABLE `issue_assignees` (
	`issue_id` text NOT NULL,
	`user_id` text NOT NULL,
	PRIMARY KEY(`issue_id`, `user_id`),
	FOREIGN KEY (`issue_id`) REFERENCES `issues`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `issue_assignees_user` ON `issue_assignees` (`user_id`,`issue_id`);--> statement-breakpoint
CREATE TABLE `issue_comments` (
	`id` text PRIMARY KEY NOT NULL,
	`issue_id` text NOT NULL,
	`author_id` text NOT NULL,
	`body` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`deleted_at` text,
	`parent_id` text,
	`reply_to_id` text,
	FOREIGN KEY (`issue_id`) REFERENCES `issues`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`author_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`parent_id`) REFERENCES `issue_comments`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`reply_to_id`) REFERENCES `issue_comments`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `issue_comments_parent` ON `issue_comments` (`parent_id`,`created_at`,`id`);--> statement-breakpoint
CREATE INDEX `issue_comments_issue_created` ON `issue_comments` (`issue_id`,`created_at`,`id`);--> statement-breakpoint
CREATE TABLE `issue_conclusions` (
	`issue_id` text PRIMARY KEY NOT NULL,
	`body` text NOT NULL,
	`comment_id` text,
	`author_id` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`issue_id`) REFERENCES `issues`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`comment_id`) REFERENCES `issue_comments`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`author_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `issue_events` (
	`id` text PRIMARY KEY NOT NULL,
	`issue_id` text NOT NULL,
	`actor_id` text NOT NULL,
	`kind` text NOT NULL,
	`details` text DEFAULT '{}' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`issue_id`) REFERENCES `issues`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `issue_events_issue_created` ON `issue_events` (`issue_id`,`created_at`,`id`);--> statement-breakpoint
CREATE TABLE `issue_labels` (
	`issue_id` text NOT NULL,
	`label_id` text NOT NULL,
	PRIMARY KEY(`issue_id`, `label_id`),
	FOREIGN KEY (`issue_id`) REFERENCES `issues`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`label_id`) REFERENCES `repository_labels`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `issue_labels_label` ON `issue_labels` (`label_id`,`issue_id`);--> statement-breakpoint
CREATE TABLE `issue_participants` (
	`issue_id` text NOT NULL,
	`user_id` text NOT NULL,
	`following` integer DEFAULT 0 NOT NULL,
	`last_read_sequence` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`issue_id`, `user_id`),
	FOREIGN KEY (`issue_id`) REFERENCES `issues`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "issue_participants_check_0" CHECK(following IN (0,1))
);
--> statement-breakpoint
CREATE INDEX `issue_participants_following` ON `issue_participants` (`user_id`,`following`,`issue_id`);--> statement-breakpoint
CREATE TABLE `issue_pull_links` (
	`issue_id` text NOT NULL,
	`pull_request_id` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`issue_id`, `pull_request_id`),
	FOREIGN KEY (`issue_id`) REFERENCES `issues`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`pull_request_id`) REFERENCES `pull_requests`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `issue_pull_links_by_pull` ON `issue_pull_links` (`pull_request_id`);--> statement-breakpoint
CREATE TABLE `issue_timeline` (
	`sequence` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`issue_id` text NOT NULL,
	`kind` text NOT NULL,
	`entity_id` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`issue_id`) REFERENCES `issues`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "issue_timeline_check_0" CHECK(kind IN ('comment', 'event', 'reference'))
);
--> statement-breakpoint
CREATE INDEX `issue_timeline_issue_sequence` ON `issue_timeline` (`issue_id`,`sequence`);--> statement-breakpoint
CREATE UNIQUE INDEX `issue_timeline_kind_entity_id_unique` ON `issue_timeline` (`kind`,`entity_id`);--> statement-breakpoint
CREATE TABLE `issues` (
	`id` text PRIMARY KEY NOT NULL,
	`repository_id` text NOT NULL,
	`number` integer NOT NULL,
	`title` text NOT NULL,
	`body` text DEFAULT '' NOT NULL,
	`author_id` text NOT NULL,
	`state` text DEFAULT 'open' NOT NULL,
	`closed_by` text,
	`closed_at` text,
	`locked_at` text,
	`locked_by` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`repository_id`) REFERENCES `repositories`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`author_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`closed_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`locked_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "issues_check_0" CHECK(state IN ('open', 'closed'))
);
--> statement-breakpoint
CREATE INDEX `issues_by_author` ON `issues` (`author_id`,"updated_at" COLLATE BINARY DESC);--> statement-breakpoint
CREATE INDEX `issues_by_state` ON `issues` (`repository_id`,`state`,"updated_at" COLLATE BINARY DESC,"id" COLLATE BINARY DESC);--> statement-breakpoint
CREATE UNIQUE INDEX `issues_repository_id_number_unique` ON `issues` (`repository_id`,`number`);--> statement-breakpoint
CREATE TABLE `work_item_references` (
	`id` text PRIMARY KEY NOT NULL,
	`source_issue_id` text,
	`source_pull_id` text,
	`source_content_kind` text NOT NULL,
	`source_content_id` text NOT NULL,
	`target_issue_id` text,
	`target_pull_id` text,
	`closes_target` integer DEFAULT 0 NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`source_issue_id`) REFERENCES `issues`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`source_pull_id`) REFERENCES `pull_requests`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`target_issue_id`) REFERENCES `issues`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`target_pull_id`) REFERENCES `pull_requests`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "work_item_references_check_0" CHECK(source_content_kind IN ('body', 'comment')),
	CONSTRAINT "work_item_references_check_1" CHECK(closes_target IN (0, 1)),
	CONSTRAINT "work_item_references_check_2" CHECK((source_issue_id IS NOT NULL) != (source_pull_id IS NOT NULL)),
	CONSTRAINT "work_item_references_check_3" CHECK((target_issue_id IS NOT NULL) != (target_pull_id IS NOT NULL))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `work_item_references_pull_target` ON `work_item_references` (`source_content_kind`,`source_content_id`,`target_pull_id`) WHERE target_pull_id IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `work_item_references_issue_target` ON `work_item_references` (`source_content_kind`,`source_content_id`,`target_issue_id`) WHERE target_issue_id IS NOT NULL;--> statement-breakpoint
CREATE INDEX `work_item_references_content` ON `work_item_references` (`source_content_kind`,`source_content_id`);--> statement-breakpoint
CREATE INDEX `work_item_references_target_pull` ON `work_item_references` (`target_pull_id`);--> statement-breakpoint
CREATE INDEX `work_item_references_target_issue` ON `work_item_references` (`target_issue_id`);--> statement-breakpoint
CREATE INDEX `work_item_references_source_pull` ON `work_item_references` (`source_pull_id`);--> statement-breakpoint
CREATE INDEX `work_item_references_source_issue` ON `work_item_references` (`source_issue_id`);--> statement-breakpoint
CREATE TABLE `organization_invitations` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`email` text COLLATE NOCASE NOT NULL,
	`role` text NOT NULL,
	`token_hash` text NOT NULL,
	`invited_by` text NOT NULL,
	`expires_at` text NOT NULL,
	`accepted_at` text,
	`revoked_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`invited_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "organization_invitations_check_0" CHECK(role IN ('admin','member'))
);
--> statement-breakpoint
CREATE INDEX `organization_invitations_by_email` ON `organization_invitations` ("email" COLLATE NOCASE,`expires_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `organization_invitations_token_hash_unique` ON `organization_invitations` (`token_hash`);--> statement-breakpoint
CREATE TABLE `organization_members` (
	`organization_id` text NOT NULL,
	`user_id` text NOT NULL,
	`role` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`organization_id`, `user_id`),
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "organization_members_check_0" CHECK(role IN ('owner','admin','member'))
);
--> statement-breakpoint
CREATE INDEX `organization_members_by_user` ON `organization_members` (`user_id`,`organization_id`);--> statement-breakpoint
CREATE TABLE `organizations` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text COLLATE NOCASE NOT NULL,
	`name` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`kind` text DEFAULT 'team' NOT NULL,
	`base_repository_role` text,
	`avatar_url` text,
	`description` text DEFAULT '' NOT NULL,
	`website` text,
	CONSTRAINT "organizations_check_0" CHECK(kind IN ('personal','team')),
	CONSTRAINT "organizations_check_1" CHECK(base_repository_role IN ('read','triage','write','maintain'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `organizations_slug_unique` ON `organizations` ("slug" COLLATE NOCASE);--> statement-breakpoint
CREATE TABLE `team_members` (
	`team_id` text NOT NULL,
	`user_id` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`team_id`, `user_id`),
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `team_members_by_user` ON `team_members` (`user_id`,`team_id`);--> statement-breakpoint
CREATE TABLE `teams` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`slug` text COLLATE NOCASE NOT NULL,
	`name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `teams_by_organization` ON `teams` (`organization_id`,"slug" COLLATE NOCASE);--> statement-breakpoint
CREATE UNIQUE INDEX `teams_organization_id_slug_unique` ON `teams` (`organization_id`,"slug" COLLATE NOCASE);--> statement-breakpoint
CREATE TABLE `release_asset_upload_parts` (
	`upload_id` text NOT NULL,
	`part_number` integer NOT NULL,
	`etag` text NOT NULL,
	`byte_size` integer NOT NULL,
	PRIMARY KEY(`upload_id`, `part_number`),
	FOREIGN KEY (`upload_id`) REFERENCES `release_asset_uploads`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "release_asset_upload_parts_check_0" CHECK(part_number > 0),
	CONSTRAINT "release_asset_upload_parts_check_1" CHECK(byte_size > 0)
);
--> statement-breakpoint
CREATE TABLE `release_asset_uploads` (
	`id` text PRIMARY KEY NOT NULL,
	`asset_id` text NOT NULL,
	`release_id` text NOT NULL,
	`uploader_id` text NOT NULL,
	`name` text NOT NULL,
	`object_key` text NOT NULL,
	`multipart_upload_id` text NOT NULL,
	`expected_size` integer NOT NULL,
	`content_type` text DEFAULT 'application/octet-stream' NOT NULL,
	`expires_at` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`release_id`) REFERENCES `releases`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`uploader_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "release_asset_uploads_check_0" CHECK(expected_size > 0)
);
--> statement-breakpoint
CREATE INDEX `release_asset_uploads_by_expiry` ON `release_asset_uploads` (`expires_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `release_asset_uploads_release_id_name_unique` ON `release_asset_uploads` (`release_id`,`name`);--> statement-breakpoint
CREATE UNIQUE INDEX `release_asset_uploads_object_key_unique` ON `release_asset_uploads` (`object_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `release_asset_uploads_asset_id_unique` ON `release_asset_uploads` (`asset_id`);--> statement-breakpoint
CREATE TABLE `release_assets` (
	`id` text PRIMARY KEY NOT NULL,
	`release_id` text NOT NULL,
	`uploader_id` text NOT NULL,
	`name` text NOT NULL,
	`object_key` text NOT NULL,
	`byte_size` integer NOT NULL,
	`content_type` text DEFAULT 'application/octet-stream' NOT NULL,
	`download_count` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`release_id`) REFERENCES `releases`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`uploader_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "release_assets_check_0" CHECK(byte_size >= 0),
	CONSTRAINT "release_assets_check_1" CHECK(download_count >= 0)
);
--> statement-breakpoint
CREATE INDEX `release_assets_by_release` ON `release_assets` (`release_id`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `release_assets_release_id_name_unique` ON `release_assets` (`release_id`,`name`);--> statement-breakpoint
CREATE UNIQUE INDEX `release_assets_object_key_unique` ON `release_assets` (`object_key`);--> statement-breakpoint
CREATE TABLE `releases` (
	`id` text PRIMARY KEY NOT NULL,
	`repository_id` text NOT NULL,
	`tag_name` text NOT NULL,
	`target_commit_id` text NOT NULL,
	`target_branch` text,
	`name` text DEFAULT '' NOT NULL,
	`body` text DEFAULT '' NOT NULL,
	`author_id` text NOT NULL,
	`source_job_id` text,
	`draft` integer DEFAULT 1 NOT NULL,
	`prerelease` integer DEFAULT 0 NOT NULL,
	`latest` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`published_at` text,
	FOREIGN KEY (`repository_id`) REFERENCES `repositories`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`author_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`source_job_id`) REFERENCES `jobs`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "releases_check_0" CHECK(draft IN (0, 1)),
	CONSTRAINT "releases_check_1" CHECK(prerelease IN (0, 1)),
	CONSTRAINT "releases_check_2" CHECK(latest IN (0, 1)),
	CONSTRAINT "releases_check_3" CHECK((draft = 1 AND published_at IS NULL AND latest = 0) OR (draft = 0 AND published_at IS NOT NULL)),
	CONSTRAINT "releases_check_4" CHECK(latest = 0 OR prerelease = 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `releases_latest` ON `releases` (`repository_id`) WHERE latest = 1;--> statement-breakpoint
CREATE INDEX `releases_by_repository` ON `releases` (`repository_id`,`draft`,"published_at" COLLATE BINARY DESC,"created_at" COLLATE BINARY DESC);--> statement-breakpoint
CREATE UNIQUE INDEX `releases_repository_id_tag_name_unique` ON `releases` (`repository_id`,`tag_name`);--> statement-breakpoint
CREATE UNIQUE INDEX `releases_source_job_id_unique` ON `releases` (`source_job_id`);--> statement-breakpoint
CREATE TABLE `audit_events` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`repository_id` text,
	`actor_id` text,
	`actor_handle` text NOT NULL,
	`action` text NOT NULL,
	`subject_type` text NOT NULL,
	`subject_id` text NOT NULL,
	`details_json` text DEFAULT '{}' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `audit_events_by_repository` ON `audit_events` (`repository_id`,"created_at" COLLATE BINARY DESC);--> statement-breakpoint
CREATE INDEX `audit_events_by_organization` ON `audit_events` (`organization_id`,"created_at" COLLATE BINARY DESC);--> statement-breakpoint
CREATE TABLE `repositories` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`name` text COLLATE NOCASE NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`visibility` text NOT NULL,
	`default_branch` text DEFAULT 'main' NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`archived_at` text,
	`deletion_scheduled_at` text,
	`deletion_started_at` text,
	`forked_from_repository_id` text,
	`fork_root_repository_id` text,
	`overview_documents_json` text,
	`icon_url` text,
	`require_check_approval` integer DEFAULT 0 NOT NULL,
	`signing_mode` text DEFAULT 'optional' NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`forked_from_repository_id`) REFERENCES `repositories`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`fork_root_repository_id`) REFERENCES `repositories`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "repositories_check_0" CHECK(visibility IN ('private', 'public')),
	CONSTRAINT "repositories_check_1" CHECK(require_check_approval IN (0,1)),
	CONSTRAINT "repositories_check_2" CHECK(signing_mode IN ('optional','vigilant','firewall'))
);
--> statement-breakpoint
CREATE INDEX `repositories_by_deletion` ON `repositories` (`deletion_scheduled_at`) WHERE deletion_scheduled_at IS NOT NULL;--> statement-breakpoint
CREATE INDEX `repositories_by_recency` ON `repositories` ("updated_at" COLLATE BINARY DESC,"id" COLLATE BINARY DESC) WHERE deletion_scheduled_at IS NULL;--> statement-breakpoint
CREATE INDEX `repositories_by_updated` ON `repositories` (`organization_id`,"updated_at" COLLATE BINARY DESC);--> statement-breakpoint
CREATE INDEX `repositories_by_fork_root` ON `repositories` (`fork_root_repository_id`);--> statement-breakpoint
CREATE INDEX `repositories_by_fork_parent` ON `repositories` (`forked_from_repository_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `repositories_organization_id_name_unique` ON `repositories` (`organization_id`,"name" COLLATE NOCASE);--> statement-breakpoint
CREATE TABLE `repository_collaborators` (
	`repository_id` text NOT NULL,
	`user_id` text NOT NULL,
	`role` text NOT NULL,
	`added_by` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`repository_id`, `user_id`),
	FOREIGN KEY (`repository_id`) REFERENCES `repositories`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`added_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "repository_collaborators_check_0" CHECK(role IN ('read','triage','write','maintain','admin'))
);
--> statement-breakpoint
CREATE INDEX `repository_collaborators_by_user` ON `repository_collaborators` (`user_id`,`repository_id`);--> statement-breakpoint
CREATE TABLE `repository_entries` (
	`repository_id` text NOT NULL,
	`tree_id` text NOT NULL,
	`path` text NOT NULL,
	`parent_path` text NOT NULL,
	`name` text NOT NULL,
	`kind` text NOT NULL,
	`object_id` text NOT NULL,
	`byte_size` integer,
	PRIMARY KEY(`repository_id`, `tree_id`, `path`),
	FOREIGN KEY (`repository_id`) REFERENCES `repositories`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "repository_entries_check_0" CHECK(kind IN ('blob', 'tree', 'commit'))
);
--> statement-breakpoint
CREATE INDEX `repository_entries_by_parent` ON `repository_entries` (`repository_id`,`tree_id`,`parent_path`,`kind`,`name`);--> statement-breakpoint
CREATE TABLE `repository_labels` (
	`id` text PRIMARY KEY NOT NULL,
	`repository_id` text NOT NULL,
	`name` text NOT NULL,
	`color` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	FOREIGN KEY (`repository_id`) REFERENCES `repositories`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `repository_labels_repository_id_name_unique` ON `repository_labels` (`repository_id`,`name`);--> statement-breakpoint
CREATE TABLE `repository_media` (
	`id` text PRIMARY KEY NOT NULL,
	`repository_id` text NOT NULL,
	`author_id` text NOT NULL,
	`object_key` text NOT NULL,
	`name` text NOT NULL,
	`content_type` text NOT NULL,
	`size` integer NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`repository_id`) REFERENCES `repositories`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`author_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `repository_media_author_created` ON `repository_media` (`author_id`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `repository_media_object_key_unique` ON `repository_media` (`object_key`);--> statement-breakpoint
CREATE TABLE `repository_stars` (
	`repository_id` text NOT NULL,
	`user_id` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`repository_id`, `user_id`),
	FOREIGN KEY (`repository_id`) REFERENCES `repositories`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `repository_stars_by_user` ON `repository_stars` (`user_id`,"created_at" COLLATE BINARY DESC);--> statement-breakpoint
CREATE TABLE `repository_team_grants` (
	`repository_id` text NOT NULL,
	`team_id` text NOT NULL,
	`role` text NOT NULL,
	`added_by` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`repository_id`, `team_id`),
	FOREIGN KEY (`repository_id`) REFERENCES `repositories`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`added_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "repository_team_grants_check_0" CHECK(role IN ('read','triage','write','maintain','admin'))
);
--> statement-breakpoint
CREATE INDEX `repository_team_grants_by_team` ON `repository_team_grants` (`team_id`,`repository_id`);--> statement-breakpoint
CREATE TABLE `pull_realtime_updates` (
	`id` text PRIMARY KEY NOT NULL,
	`pull_request_id` text NOT NULL,
	`version` integer NOT NULL,
	`kind` text NOT NULL,
	`payload` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`pull_request_id`) REFERENCES `pull_requests`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `pull_realtime_updates_pull_version_idx` ON `pull_realtime_updates` (`pull_request_id`,`version`);--> statement-breakpoint
CREATE UNIQUE INDEX `pull_realtime_updates_pull_request_id_version_unique` ON `pull_realtime_updates` (`pull_request_id`,`version`);--> statement-breakpoint
CREATE TABLE `pull_request_assignees` (
	`pull_request_id` text NOT NULL,
	`user_id` text NOT NULL,
	PRIMARY KEY(`pull_request_id`, `user_id`),
	FOREIGN KEY (`pull_request_id`) REFERENCES `pull_requests`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `pull_request_comments` (
	`id` text PRIMARY KEY NOT NULL,
	`pull_request_id` text NOT NULL,
	`author_id` text NOT NULL,
	`body` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`pull_request_id`) REFERENCES `pull_requests`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`author_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `pull_request_comments_pull_created_idx` ON `pull_request_comments` (`pull_request_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `pull_request_events` (
	`id` text PRIMARY KEY NOT NULL,
	`pull_request_id` text NOT NULL,
	`actor_id` text NOT NULL,
	`kind` text NOT NULL,
	`details` text DEFAULT '{}' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`pull_request_id`) REFERENCES `pull_requests`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `pull_request_events_pull_created_idx` ON `pull_request_events` (`pull_request_id`,`created_at`,`id`);--> statement-breakpoint
CREATE TABLE `pull_request_labels` (
	`pull_request_id` text NOT NULL,
	`label_id` text NOT NULL,
	PRIMARY KEY(`pull_request_id`, `label_id`),
	FOREIGN KEY (`pull_request_id`) REFERENCES `pull_requests`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`label_id`) REFERENCES `repository_labels`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `pull_request_reviews` (
	`id` text PRIMARY KEY NOT NULL,
	`pull_request_id` text NOT NULL,
	`author_id` text NOT NULL,
	`state` text NOT NULL,
	`body` text DEFAULT '' NOT NULL,
	`commit_id` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`carried_from_review_id` text,
	FOREIGN KEY (`pull_request_id`) REFERENCES `pull_requests`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`author_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`carried_from_review_id`) REFERENCES `pull_request_reviews`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "pull_request_reviews_check_0" CHECK(state IN ('commented', 'approved', 'changes_requested'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `carried_review_per_head` ON `pull_request_reviews` (`carried_from_review_id`,`commit_id`) WHERE carried_from_review_id IS NOT NULL;--> statement-breakpoint
CREATE INDEX `reviews_by_pull` ON `pull_request_reviews` (`pull_request_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `pull_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`repository_id` text NOT NULL,
	`number` integer NOT NULL,
	`title` text NOT NULL,
	`body` text DEFAULT '' NOT NULL,
	`author_id` text NOT NULL,
	`source_branch` text NOT NULL,
	`target_branch` text NOT NULL,
	`source_commit_id` text NOT NULL,
	`target_commit_id` text NOT NULL,
	`state` text DEFAULT 'open' NOT NULL,
	`merged_commit_id` text,
	`merged_by` text,
	`merged_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`merge_method` text,
	`locked_at` text,
	`locked_by` text,
	`realtime_version` integer DEFAULT 0 NOT NULL,
	`source_repository_id` text,
	FOREIGN KEY (`repository_id`) REFERENCES `repositories`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`author_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`merged_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`locked_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`source_repository_id`) REFERENCES `repositories`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "pull_requests_check_0" CHECK(state IN ('draft', 'open', 'merged', 'closed')),
	CONSTRAINT "pull_requests_check_1" CHECK(merge_method IN ('merge', 'squash', 'rebase'))
);
--> statement-breakpoint
CREATE INDEX `pull_requests_by_state` ON `pull_requests` (`repository_id`,`state`,"updated_at" COLLATE BINARY DESC);--> statement-breakpoint
CREATE INDEX `pull_requests_by_source_repository` ON `pull_requests` (`source_repository_id`,`state`,`source_branch`);--> statement-breakpoint
CREATE UNIQUE INDEX `pull_requests_repository_id_number_unique` ON `pull_requests` (`repository_id`,`number`);--> statement-breakpoint
CREATE TABLE `pull_timeline` (
	`sequence` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`pull_request_id` text NOT NULL,
	`kind` text NOT NULL,
	`entity_id` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`pull_request_id`) REFERENCES `pull_requests`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "pull_timeline_check_0" CHECK(kind IN ('comment', 'review', 'thread', 'event', 'reference'))
);
--> statement-breakpoint
CREATE INDEX `pull_timeline_pull_sequence_idx` ON `pull_timeline` (`pull_request_id`,`sequence`);--> statement-breakpoint
CREATE UNIQUE INDEX `pull_timeline_kind_entity_id_unique` ON `pull_timeline` (`kind`,`entity_id`);--> statement-breakpoint
CREATE TABLE `review_comments` (
	`id` text PRIMARY KEY NOT NULL,
	`thread_id` text NOT NULL,
	`author_id` text NOT NULL,
	`body` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`thread_id`) REFERENCES `review_threads`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`author_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `comments_by_thread` ON `review_comments` (`thread_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `review_threads` (
	`id` text PRIMARY KEY NOT NULL,
	`pull_request_id` text NOT NULL,
	`path` text NOT NULL,
	`side` text NOT NULL,
	`line` integer NOT NULL,
	`resolved_by` text,
	`resolved_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`commit_id` text,
	`start_side` text,
	`start_line` integer,
	FOREIGN KEY (`pull_request_id`) REFERENCES `pull_requests`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`resolved_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "review_threads_check_0" CHECK(side IN ('old', 'new')),
	CONSTRAINT "review_threads_check_1" CHECK(start_side IN ('old', 'new'))
);
--> statement-breakpoint
CREATE INDEX `review_threads_by_pull_commit` ON `review_threads` (`pull_request_id`,`commit_id`,`created_at`);