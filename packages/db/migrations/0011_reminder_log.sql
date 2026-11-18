CREATE TABLE `reminder_log` (
	`task_id` text NOT NULL REFERENCES `tasks`(`id`),
	`user_id` text NOT NULL REFERENCES `users`(`id`),
	`kind` text NOT NULL,
	`due_date` text NOT NULL,
	`sent_at` integer NOT NULL,
	PRIMARY KEY(`task_id`, `user_id`, `kind`, `due_date`),
	CONSTRAINT `check_reminder_log_kind` CHECK (`kind` IN ('DUE_SOON', 'OVERDUE'))
);
