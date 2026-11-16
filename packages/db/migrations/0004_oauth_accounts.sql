CREATE TABLE `oauth_accounts` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL,
  `provider` text NOT NULL,
  `provider_account_id` text NOT NULL,
  `created_at` integer NOT NULL,
  CONSTRAINT `oauth_accounts_user_fk` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`),
  CONSTRAINT `oauth_accounts_provider_check` CHECK (`provider` IN ('GOOGLE', 'MICROSOFT'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_oauth_provider_account` ON `oauth_accounts` (`provider`, `provider_account_id`);
