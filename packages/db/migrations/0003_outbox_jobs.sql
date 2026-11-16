CREATE TABLE `outbox_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`payload` text NOT NULL,
	`status` text DEFAULT 'PENDING' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`next_attempt_at` integer NOT NULL,
	`last_error` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT `outbox_jobs_type_check` CHECK(`outbox_jobs`.`type` IN ('SLACK_POST_TASK', 'SLACK_UPDATE_THREAD', 'EMAIL_DEADLINE_REMINDER', 'EMAIL_INVITE')),
	CONSTRAINT `outbox_jobs_status_check` CHECK(`outbox_jobs`.`status` IN ('PENDING', 'RUNNING', 'DONE', 'FAILED', 'DEAD', 'SKIPPED'))
);
--> statement-breakpoint
CREATE INDEX `idx_outbox_status_next` ON `outbox_jobs` (`status`,`next_attempt_at`);
