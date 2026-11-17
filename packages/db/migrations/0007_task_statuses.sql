CREATE TABLE `task_statuses` (
  `id` text PRIMARY KEY NOT NULL,
  `name` text NOT NULL COLLATE NOCASE,
  `category` text NOT NULL,
  `position` integer NOT NULL,
  `is_default` integer DEFAULT 0 NOT NULL,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL,
  CONSTRAINT "task_statuses_category_check" CHECK("category" IN ('TODO', 'IN_PROGRESS', 'REVIEW', 'DONE'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_task_statuses_name` ON `task_statuses` (`name`);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_task_statuses_default` ON `task_statuses` (`category`) WHERE `is_default` = 1;

