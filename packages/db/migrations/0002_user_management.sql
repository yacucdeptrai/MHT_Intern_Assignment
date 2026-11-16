CREATE TABLE `projects` (
  `id` text PRIMARY KEY NOT NULL,
  `code` text NOT NULL COLLATE NOCASE,
  `name` text NOT NULL,
  `description` text,
  `budget` integer,
  `start_date` text NOT NULL,
  `end_date` text NOT NULL,
  `status` text DEFAULT 'ACTIVE' NOT NULL,
  `slack_channel_id` text,
  `created_by_id` text NOT NULL,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL,
  `deleted_at` integer,
  CONSTRAINT `projects_created_by_fk` FOREIGN KEY (`created_by_id`) REFERENCES `users` (`id`),
  CONSTRAINT `projects_code_length` CHECK (length(`code`) BETWEEN 2 AND 10),
  CONSTRAINT `projects_budget_check` CHECK (`budget` IS NULL OR `budget` >= 0),
  CONSTRAINT `projects_dates_check` CHECK (`end_date` >= `start_date`),
  CONSTRAINT `projects_status_check` CHECK (`status` IN ('ACTIVE', 'ON_HOLD', 'COMPLETED'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_projects_code` ON `projects` (`code`);
--> statement-breakpoint
CREATE TABLE `invites` (
  `id` text PRIMARY KEY NOT NULL,
  `email` text NOT NULL COLLATE NOCASE,
  `token_hash` text NOT NULL,
  `user_id` text,
  `project_id` text,
  `project_role` text,
  `invited_by_id` text NOT NULL,
  `expires_at` integer NOT NULL,
  `accepted_at` integer,
  `created_at` integer NOT NULL,
  CONSTRAINT `invites_user_fk` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`),
  CONSTRAINT `invites_project_fk` FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`),
  CONSTRAINT `invites_invited_by_fk` FOREIGN KEY (`invited_by_id`) REFERENCES `users` (`id`),
  CONSTRAINT `invites_project_role_check` CHECK (`project_role` IS NULL OR `project_role` IN ('PM', 'TEAM_LEAD', 'MEMBER')),
  CONSTRAINT `invites_project_parity` CHECK ((`project_id` IS NULL) = (`project_role` IS NULL))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_invites_token_hash` ON `invites` (`token_hash`);
--> statement-breakpoint
CREATE INDEX `idx_invites_expires` ON `invites` (`accepted_at`, `expires_at`);
--> statement-breakpoint
CREATE TABLE `audit_logs` (
  `id` text PRIMARY KEY NOT NULL,
  `actor_id` text,
  `action` text NOT NULL,
  `entity_type` text NOT NULL,
  `entity_id` text NOT NULL,
  `project_id` text,
  `changes` text,
  `created_at` integer NOT NULL,
  CONSTRAINT `audit_logs_actor_fk` FOREIGN KEY (`actor_id`) REFERENCES `users` (`id`),
  CONSTRAINT `audit_logs_project_fk` FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`),
  CONSTRAINT `audit_logs_entity_type_check` CHECK (`entity_type` IN ('USER', 'PROJECT', 'PROJECT_MEMBER', 'SPRINT', 'TASK', 'ATTACHMENT', 'STATUS')),
  CONSTRAINT `audit_logs_action_check` CHECK (`action` IN (
    'PROJECT_CREATED', 'PROJECT_UPDATED', 'PROJECT_ARCHIVED',
    'MEMBER_ADDED', 'MEMBER_REMOVED', 'MEMBER_ROLE_CHANGED',
    'TASK_CREATED', 'TASK_UPDATED', 'TASK_STATUS_CHANGED',
    'TASK_ASSIGNED', 'TASK_APPROVED', 'TASK_REJECTED', 'TASK_REOPENED',
    'TASK_ARCHIVED', 'ATTACHMENT_ADDED', 'ATTACHMENT_REMOVED',
    'SPRINT_CREATED', 'SPRINT_UPDATED', 'SPRINT_ARCHIVED',
    'USER_CREATED', 'USER_UPDATED', 'USER_LOCKED', 'USER_UNLOCKED',
    'USER_DELETED', 'USER_ROLE_CHANGED',
    'STATUS_CREATED', 'STATUS_UPDATED', 'STATUS_DELETED'
  ))
);
--> statement-breakpoint
CREATE INDEX `idx_audit_entity` ON `audit_logs` (`entity_type`, `entity_id`, `created_at`);
--> statement-breakpoint
CREATE INDEX `idx_audit_created` ON `audit_logs` (`created_at`);
