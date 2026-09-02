DROP INDEX `uq_response_votes_user_response`;--> statement-breakpoint
CREATE UNIQUE INDEX `uq_response_votes_user_response` ON `response_votes` (`response_id`,`user_id`);