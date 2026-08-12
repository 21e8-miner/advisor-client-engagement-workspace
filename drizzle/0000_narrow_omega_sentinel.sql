CREATE TABLE `activities` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`type` text NOT NULL,
	`detail` text NOT NULL,
	`actor` text NOT NULL,
	`occurred_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `activities_household_time_idx` ON `activities` (`household_id`,`occurred_at`);--> statement-breakpoint
CREATE TABLE `audit_events` (
	`id` text PRIMARY KEY NOT NULL,
	`event_type` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`actor` text NOT NULL,
	`payload_json` text NOT NULL,
	`previous_hash` text NOT NULL,
	`event_hash` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `audit_created_idx` ON `audit_events` (`created_at`);--> statement-breakpoint
CREATE TABLE `households` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`primary_name` text NOT NULL,
	`partner_name` text,
	`service_tier` text NOT NULL,
	`assets` integer NOT NULL,
	`cash_balance` integer NOT NULL,
	`next_review` text NOT NULL,
	`last_contact` text NOT NULL,
	`plan_status` text NOT NULL,
	`risk_level` text NOT NULL,
	`tags_json` text NOT NULL,
	`open_items` integer NOT NULL,
	`linked_plan` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `households_next_review_idx` ON `households` (`next_review`);--> statement-breakpoint
CREATE INDEX `households_risk_level_idx` ON `households` (`risk_level`);--> statement-breakpoint
CREATE TABLE `opportunities` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`name` text NOT NULL,
	`value` integer NOT NULL,
	`stage` text NOT NULL,
	`owner` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `opportunities_stage_idx` ON `opportunities` (`stage`);--> statement-breakpoint
CREATE TABLE `planner_scenarios` (
	`household_id` text PRIMARY KEY NOT NULL,
	`scenario_json` text NOT NULL,
	`updated_by` text NOT NULL,
	`updated_at` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`title` text NOT NULL,
	`due_date` text NOT NULL,
	`due_label` text NOT NULL,
	`owner` text NOT NULL,
	`category` text NOT NULL,
	`status` text NOT NULL,
	`requires_approval` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `tasks_household_idx` ON `tasks` (`household_id`);--> statement-breakpoint
CREATE INDEX `tasks_status_due_idx` ON `tasks` (`status`,`due_date`);--> statement-breakpoint
CREATE TABLE `workflow_steps` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`workflow_name` text NOT NULL,
	`sequence` integer NOT NULL,
	`title` text NOT NULL,
	`status` text NOT NULL,
	`approval_type` text,
	`completed_by` text,
	`completed_at` text
);
--> statement-breakpoint
CREATE INDEX `workflow_household_sequence_idx` ON `workflow_steps` (`household_id`,`sequence`);