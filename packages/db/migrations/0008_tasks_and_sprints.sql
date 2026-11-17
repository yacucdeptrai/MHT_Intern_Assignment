CREATE TABLE `sprints` (
  `id` text PRIMARY KEY NOT NULL,
  `project_id` text NOT NULL REFERENCES `projects`(`id`),
  `name` text NOT NULL,
  `start_date` text NOT NULL,
  `end_date` text NOT NULL,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL,
  `deleted_at` integer,
  CONSTRAINT `uq_sprints_id_project` UNIQUE (`id`, `project_id`),
  CONSTRAINT `check_sprints_dates` CHECK (`end_date` >= `start_date`)
);
--> statement-breakpoint
CREATE INDEX `idx_sprints_project` ON `sprints` (`project_id`, `deleted_at`, `start_date`);
--> statement-breakpoint

CREATE TABLE `tasks` (
  `id` text PRIMARY KEY NOT NULL,
  `project_id` text NOT NULL REFERENCES `projects`(`id`),
  `number` integer NOT NULL,
  `parent_task_id` text,
  `sprint_id` text,
  `status_id` text NOT NULL REFERENCES `task_statuses`(`id`),
  `title` text NOT NULL,
  `description` text,
  `priority` text NOT NULL DEFAULT 'MEDIUM',
  `start_date` text,
  `due_date` text,
  `created_by_id` text NOT NULL REFERENCES `users`(`id`),
  `slack_thread_ts` text,
  `status_changed_at` integer NOT NULL,
  `completed_at` integer,
  `version` integer NOT NULL DEFAULT 1,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL,
  `deleted_at` integer,
  CONSTRAINT `uq_tasks_id_project` UNIQUE (`id`, `project_id`),
  CONSTRAINT `uq_tasks_project_number` UNIQUE (`project_id`, `number`),
  CONSTRAINT `fk_tasks_sprint_project` FOREIGN KEY (`sprint_id`, `project_id`) REFERENCES `sprints`(`id`, `project_id`),
  CONSTRAINT `fk_tasks_parent_project` FOREIGN KEY (`parent_task_id`, `project_id`) REFERENCES `tasks`(`id`, `project_id`),
  CONSTRAINT `check_tasks_priority` CHECK (`priority` IN ('LOW', 'MEDIUM', 'HIGH', 'URGENT')),
  CONSTRAINT `check_tasks_dates` CHECK (`start_date` IS NULL OR `due_date` IS NULL OR `due_date` >= `start_date`)
);
--> statement-breakpoint
CREATE INDEX `idx_tasks_project_status` ON `tasks` (`project_id`, `deleted_at`, `status_id`);
--> statement-breakpoint
CREATE INDEX `idx_tasks_project_sprint` ON `tasks` (`project_id`, `sprint_id`, `deleted_at`);
--> statement-breakpoint
CREATE INDEX `idx_tasks_parent` ON `tasks` (`parent_task_id`);
--> statement-breakpoint
CREATE INDEX `idx_tasks_due` ON `tasks` (`due_date`) WHERE `deleted_at` IS NULL;
--> statement-breakpoint
CREATE INDEX `idx_tasks_status` ON `tasks` (`status_id`, `status_changed_at`);
--> statement-breakpoint
CREATE INDEX `idx_tasks_project_completed` ON `tasks` (`project_id`, `completed_at`);
--> statement-breakpoint

CREATE TABLE `task_assignees` (
  `task_id` text NOT NULL REFERENCES `tasks`(`id`),
  `user_id` text NOT NULL REFERENCES `users`(`id`),
  `assigned_at` integer NOT NULL,
  PRIMARY KEY (`task_id`, `user_id`)
);
--> statement-breakpoint
CREATE INDEX `idx_task_assignees_user` ON `task_assignees` (`user_id`);
