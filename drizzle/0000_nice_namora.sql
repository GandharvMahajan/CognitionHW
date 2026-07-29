CREATE TABLE `audit_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`domain` text NOT NULL,
	`entity_id` text NOT NULL,
	`action` text NOT NULL,
	`actor` text NOT NULL,
	`detail` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `documents` (
	`id` text PRIMARY KEY NOT NULL,
	`case_id` text NOT NULL,
	`file_name` text NOT NULL,
	`content_type` text NOT NULL,
	`size` integer NOT NULL,
	`storage_key` text NOT NULL,
	`uploaded_by` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `flag_versions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`flag_id` text NOT NULL,
	`version` integer NOT NULL,
	`enabled` integer NOT NULL,
	`rollout` integer NOT NULL,
	`variant` text NOT NULL,
	`reason` text NOT NULL,
	`actor` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `flags` (
	`id` text PRIMARY KEY NOT NULL,
	`flag_key` text NOT NULL,
	`name` text NOT NULL,
	`description` text NOT NULL,
	`environment` text NOT NULL,
	`enabled` integer NOT NULL,
	`rollout` integer NOT NULL,
	`owner` text NOT NULL,
	`status` text NOT NULL,
	`variant` text NOT NULL,
	`version` integer NOT NULL,
	`expires_at` text NOT NULL,
	`updated_by` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `kyc_cases` (
	`id` text PRIMARY KEY NOT NULL,
	`customer_name` text NOT NULL,
	`entity_type` text NOT NULL,
	`country` text NOT NULL,
	`risk` text NOT NULL,
	`status` text NOT NULL,
	`assignee` text,
	`sla_at` text NOT NULL,
	`score` integer NOT NULL,
	`trigger` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `refunds` (
	`id` text PRIMARY KEY NOT NULL,
	`payment_id` text NOT NULL,
	`customer_name` text NOT NULL,
	`amount` real NOT NULL,
	`currency` text NOT NULL,
	`reason` text NOT NULL,
	`status` text NOT NULL,
	`risk` text NOT NULL,
	`requested_by` text NOT NULL,
	`approver` text,
	`idempotency_key` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `refunds_idempotency_key_unique` ON `refunds` (`idempotency_key`);--> statement-breakpoint
CREATE TABLE `users` (
	`email` text PRIMARY KEY NOT NULL,
	`display_name` text NOT NULL,
	`role` text DEFAULT 'analyst' NOT NULL,
	`created_at` text NOT NULL
);
