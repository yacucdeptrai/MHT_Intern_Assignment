CREATE TABLE `project_members` (
  `project_id` text NOT NULL,
  `user_id` text NOT NULL,
  `project_role` text NOT NULL,
  `created_at` integer NOT NULL,
  PRIMARY KEY(`project_id`, `user_id`),
  CONSTRAINT `project_members_project_fk` FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`),
  CONSTRAINT `project_members_user_fk` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`),
  CONSTRAINT `project_members_role_check` CHECK (`project_role` IN ('PM', 'TEAM_LEAD', 'MEMBER'))
);
--> statement-breakpoint
CREATE INDEX `idx_project_members_user` ON `project_members` (`user_id`);
