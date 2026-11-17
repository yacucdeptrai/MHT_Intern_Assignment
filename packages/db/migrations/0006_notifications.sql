CREATE TABLE `notifications` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL,
  `type` text NOT NULL,
  `entity_id` text NOT NULL,
  `project_id` text NOT NULL,
  `payload` text NOT NULL,
  `read_at` integer,
  `created_at` integer NOT NULL,
  CONSTRAINT `notifications_user_fk` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`),
  CONSTRAINT `notifications_project_fk` FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`),
  CONSTRAINT `notifications_type_check` CHECK (`type` IN ('TASK_ASSIGNED', 'TASK_COMMENTED', 'TASK_APPROVED', 'TASK_REJECTED', 'TASK_REOPENED', 'PROJECT_MEMBER_ADDED'))
);
--> statement-breakpoint
CREATE INDEX `idx_notifications_user_read` ON `notifications` (`user_id`, `read_at`, `created_at`);
