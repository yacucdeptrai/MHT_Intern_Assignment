CREATE TABLE `comments` (
  `id` text PRIMARY KEY NOT NULL,
  `task_id` text NOT NULL REFERENCES `tasks`(`id`),
  `author_id` text NOT NULL REFERENCES `users`(`id`),
  `parent_comment_id` text,
  `body` text NOT NULL,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL,
  `deleted_at` integer,
  CONSTRAINT `fk_comments_parent` FOREIGN KEY (`parent_comment_id`) REFERENCES `comments`(`id`),
  CONSTRAINT `check_comments_body_length` CHECK (length(`body`) BETWEEN 1 AND 5000),
  CONSTRAINT `check_comments_no_self_parent` CHECK (`parent_comment_id` IS NULL OR `parent_comment_id` != `id`)
);
--> statement-breakpoint
CREATE INDEX `idx_comments_task` ON `comments` (`task_id`, `created_at`);
