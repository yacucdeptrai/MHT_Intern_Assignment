CREATE TABLE `cron_state` (
	`key` text NOT NULL PRIMARY KEY,
	`value` text,
	`updated_at` integer NOT NULL
);
