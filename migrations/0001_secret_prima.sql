CREATE TABLE `sessions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`token_hash` text NOT NULL,
	`user_agent` text,
	`ip_address` text,
	`expires_at` text NOT NULL,
	`last_seen_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sessions_token_hash_unique` ON `sessions` (`token_hash`);--> statement-breakpoint
CREATE INDEX `idx_sessions_user` ON `sessions` (`user_id`);--> statement-breakpoint
ALTER TABLE `otp_tokens` ADD `request_id` text NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `otp_tokens_request_id_unique` ON `otp_tokens` (`request_id`);--> statement-breakpoint
CREATE INDEX `idx_otp_tokens_request_id` ON `otp_tokens` (`request_id`);