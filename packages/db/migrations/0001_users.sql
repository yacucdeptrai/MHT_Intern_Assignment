CREATE TABLE `users` (
  `id` text PRIMARY KEY NOT NULL,
  `email` text NOT NULL COLLATE NOCASE,
  `full_name` text NOT NULL,
  `phone` text,
  `department` text,
  `avatar_key` text,
  `password_hash` text,
  `password_iterations` integer,
  `system_role` text DEFAULT 'MEMBER' NOT NULL,
  `status` text DEFAULT 'ACTIVE' NOT NULL,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL,
  `deleted_at` integer,
  CONSTRAINT `users_password_parity` CHECK ((`password_hash` IS NULL) = (`password_iterations` IS NULL)),
  CONSTRAINT `users_system_role_check` CHECK (`system_role` IN ('MEMBER', 'TEAM_LEAD', 'PM', 'ADMIN')),
  CONSTRAINT `users_status_check` CHECK (`status` IN ('ACTIVE', 'LOCKED'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_users_email` ON `users` (`email`);
--> statement-breakpoint
CREATE INDEX `idx_users_status_deleted` ON `users` (`deleted_at`, `status`);
