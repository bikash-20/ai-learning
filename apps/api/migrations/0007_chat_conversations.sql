-- Conversations table: groups chat messages per user per "thread" for
-- history sidebar + auto-titling. Replaces ad-hoc chat_message flat
-- history.
CREATE TABLE `conversation` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL,
  `title` text NOT NULL,
  `mode` text NOT NULL DEFAULT 'general',
  `created_at` integer NOT NULL DEFAULT (unixepoch()),
  `updated_at` integer NOT NULL DEFAULT (unixepoch())
);
--> statement-breakpoint
CREATE INDEX `conversation_user_idx` ON `conversation` (`user_id`, `updated_at` DESC);
--> statement-breakpoint
-- Per-message rows. Same shape as the existing chat_message table but
-- scoped to a conversation. The old chat_message table is left in place
-- (back-compat for the legacy /api/chat/history endpoint).
CREATE TABLE `conversation_message` (
  `id` text PRIMARY KEY NOT NULL,
  `conversation_id` text NOT NULL,
  `role` text NOT NULL,
  `content` text NOT NULL,
  `provider` text,
  `model` text,
  `tokens` integer,
  `created_at` integer NOT NULL DEFAULT (unixepoch())
);
--> statement-breakpoint
CREATE INDEX `conversation_message_conv_idx` ON `conversation_message` (`conversation_id`, `created_at` ASC);