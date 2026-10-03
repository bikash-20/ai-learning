-- Initial schema. Better Auth + authored content + quiz + chat.

CREATE TABLE `user` (
  `id` text PRIMARY KEY NOT NULL,
  `name` text NOT NULL,
  `email` text NOT NULL,
  `email_verified` integer NOT NULL DEFAULT 0,
  `image` text,
  `created_at` integer NOT NULL DEFAULT (unixepoch()),
  `updated_at` integer NOT NULL DEFAULT (unixepoch())
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_email_unique` ON `user` (`email`);
--> statement-breakpoint

CREATE TABLE `session` (
  `id` text PRIMARY KEY NOT NULL,
  `expires_at` integer NOT NULL,
  `token` text NOT NULL,
  `created_at` integer NOT NULL DEFAULT (unixepoch()),
  `updated_at` integer NOT NULL DEFAULT (unixepoch()),
  `ip_address` text,
  `user_agent` text,
  `user_id` text NOT NULL REFERENCES `user`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE UNIQUE INDEX `session_token_unique` ON `session` (`token`);
--> statement-breakpoint
CREATE INDEX `session_user_idx` ON `session` (`user_id`);
--> statement-breakpoint

CREATE TABLE `account` (
  `id` text PRIMARY KEY NOT NULL,
  `account_id` text NOT NULL,
  `provider_id` text NOT NULL,
  `user_id` text NOT NULL REFERENCES `user`(`id`) ON DELETE CASCADE,
  `access_token` text,
  `refresh_token` text,
  `id_token` text,
  `access_token_expires_at` integer,
  `refresh_token_expires_at` integer,
  `scope` text,
  `password` text,
  `created_at` integer NOT NULL DEFAULT (unixepoch()),
  `updated_at` integer NOT NULL DEFAULT (unixepoch())
);
--> statement-breakpoint
CREATE INDEX `account_user_idx` ON `account` (`user_id`);
--> statement-breakpoint

CREATE TABLE `verification` (
  `id` text PRIMARY KEY NOT NULL,
  `identifier` text NOT NULL,
  `value` text NOT NULL,
  `expires_at` integer NOT NULL,
  `created_at` integer DEFAULT (unixepoch()),
  `updated_at` integer DEFAULT (unixepoch())
);
--> statement-breakpoint

CREATE TABLE `vocab` (
  `id` text PRIMARY KEY NOT NULL,
  `word` text NOT NULL,
  `pos` text NOT NULL,
  `definition` text NOT NULL,
  `examples` text NOT NULL,
  `tags` text NOT NULL DEFAULT '[]',
  `level` text NOT NULL,
  `created_by` text REFERENCES `user`(`id`),
  `created_at` integer NOT NULL DEFAULT (unixepoch())
);
--> statement-breakpoint
CREATE UNIQUE INDEX `vocab_word_idx` ON `vocab` (`word`);
--> statement-breakpoint
CREATE INDEX `vocab_level_idx` ON `vocab` (`level`);
--> statement-breakpoint

CREATE TABLE `grammar` (
  `id` text PRIMARY KEY NOT NULL,
  `topic` text NOT NULL,
  `level` text NOT NULL,
  `explanation` text NOT NULL,
  `examples` text NOT NULL,
  `created_by` text REFERENCES `user`(`id`),
  `created_at` integer NOT NULL DEFAULT (unixepoch())
);
--> statement-breakpoint
CREATE INDEX `grammar_level_idx` ON `grammar` (`level`);
--> statement-breakpoint

CREATE TABLE `quiz` (
  `id` text PRIMARY KEY NOT NULL,
  `owner_id` text REFERENCES `user`(`id`) ON DELETE SET NULL,
  `source` text NOT NULL,
  `topic` text NOT NULL,
  `level` text NOT NULL,
  `created_at` integer NOT NULL DEFAULT (unixepoch())
);
--> statement-breakpoint
CREATE INDEX `quiz_topic_idx` ON `quiz` (`topic`, `level`);
--> statement-breakpoint

CREATE TABLE `quiz_item` (
  `id` text PRIMARY KEY NOT NULL,
  `quiz_id` text NOT NULL REFERENCES `quiz`(`id`) ON DELETE CASCADE,
  `prompt` text NOT NULL,
  `options` text NOT NULL,
  `answer_idx` integer NOT NULL,
  `explanation` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `quiz_item_quiz_idx` ON `quiz_item` (`quiz_id`);
--> statement-breakpoint

CREATE TABLE `quiz_attempt` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL REFERENCES `user`(`id`) ON DELETE CASCADE,
  `quiz_id` text NOT NULL REFERENCES `quiz`(`id`) ON DELETE CASCADE,
  `score` integer NOT NULL,
  `started_at` integer NOT NULL DEFAULT (unixepoch()),
  `finished_at` integer
);
--> statement-breakpoint
CREATE INDEX `quiz_attempt_user_idx` ON `quiz_attempt` (`user_id`);
--> statement-breakpoint

CREATE TABLE `attempt_item` (
  `id` text PRIMARY KEY NOT NULL,
  `attempt_id` text NOT NULL REFERENCES `quiz_attempt`(`id`) ON DELETE CASCADE,
  `item_id` text NOT NULL REFERENCES `quiz_item`(`id`) ON DELETE CASCADE,
  `picked` integer NOT NULL,
  `correct` integer NOT NULL,
  `ai_explanation` text
);
--> statement-breakpoint
CREATE INDEX `attempt_item_attempt_idx` ON `attempt_item` (`attempt_id`);
--> statement-breakpoint

CREATE TABLE `flash_deck` (
  `id` text PRIMARY KEY NOT NULL,
  `owner_id` text REFERENCES `user`(`id`) ON DELETE SET NULL,
  `title` text NOT NULL,
  `source` text NOT NULL,
  `topic` text NOT NULL,
  `created_at` integer NOT NULL DEFAULT (unixepoch())
);
--> statement-breakpoint

CREATE TABLE `flash_card` (
  `id` text PRIMARY KEY NOT NULL,
  `deck_id` text NOT NULL REFERENCES `flash_deck`(`id`) ON DELETE CASCADE,
  `front` text NOT NULL,
  `back` text NOT NULL,
  `srs_state` text NOT NULL
);
--> statement-breakpoint

CREATE TABLE `review` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL REFERENCES `user`(`id`) ON DELETE CASCADE,
  `card_id` text NOT NULL REFERENCES `flash_card`(`id`) ON DELETE CASCADE,
  `grade` integer NOT NULL,
  `reviewed_at` integer NOT NULL DEFAULT (unixepoch())
);
--> statement-breakpoint

CREATE TABLE `exam_template` (
  `id` text PRIMARY KEY NOT NULL,
  `kind` text NOT NULL,
  `title` text NOT NULL,
  `total_duration_min` integer NOT NULL,
  `sections` text NOT NULL
);
--> statement-breakpoint

CREATE TABLE `exam_attempt` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL REFERENCES `user`(`id`) ON DELETE CASCADE,
  `template_id` text NOT NULL REFERENCES `exam_template`(`id`),
  `score` integer,
  `started_at` integer NOT NULL DEFAULT (unixepoch()),
  `finished_at` integer
);
--> statement-breakpoint

CREATE TABLE `chat_message` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL REFERENCES `user`(`id`) ON DELETE CASCADE,
  `role` text NOT NULL,
  `content` text NOT NULL,
  `provider` text,
  `model` text,
  `tokens` integer,
  `created_at` integer NOT NULL DEFAULT (unixepoch())
);
--> statement-breakpoint
CREATE INDEX `chat_msg_user_idx` ON `chat_message` (`user_id`, `created_at`);