CREATE TABLE `attachments` (
	`id` text PRIMARY KEY NOT NULL,
	`task_id` text NOT NULL REFERENCES `tasks`(`id`),
	`uploaded_by_id` text NOT NULL REFERENCES `users`(`id`),
	`file_name` text NOT NULL,
	`content_type` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`storage_key` text NOT NULL,
	`created_at` integer NOT NULL,
	CONSTRAINT `uq_attachments_storage_key` UNIQUE (`storage_key`),
	CONSTRAINT `check_attachments_size` CHECK (`size_bytes` BETWEEN 1 AND 10485760),
	CONSTRAINT `check_attachments_file_name_length` CHECK (length(`file_name`) BETWEEN 1 AND 255)
);
--> statement-breakpoint
CREATE INDEX `idx_attachments_task` ON `attachments` (`task_id`);
