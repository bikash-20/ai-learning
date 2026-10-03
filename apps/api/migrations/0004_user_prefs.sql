-- 0004_user_prefs.sql
-- Per-user preferences: feature toggles, theme, etc. One row per user.
-- Upserted via INSERT OR REPLACE on PUT /api/me/prefs.

CREATE TABLE `user_prefs` (
  `user_id` text PRIMARY KEY NOT NULL REFERENCES `user`(`id`) ON DELETE CASCADE,
  -- Show AI explanation alongside the static one on quiz reveal.
  -- Off = static explanation only (no AI cascade call).
  `ai_explain` integer NOT NULL DEFAULT 1,
  -- Preferred theme: 'system' follows the OS, 'light' or 'dark' override.
  `theme` text NOT NULL DEFAULT 'system',
  `updated_at` integer NOT NULL DEFAULT (unixepoch())
);