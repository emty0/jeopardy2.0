CREATE TABLE `question_media` (
	`id` text PRIMARY KEY NOT NULL,
	`question_id` text NOT NULL,
	`url` text NOT NULL,
	`type` text DEFAULT 'image' NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`question_id`) REFERENCES `question`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `game_player` ADD `color` text DEFAULT '#7C3AED' NOT NULL;--> statement-breakpoint
ALTER TABLE `question` ADD `rapid_fire` integer DEFAULT false NOT NULL;