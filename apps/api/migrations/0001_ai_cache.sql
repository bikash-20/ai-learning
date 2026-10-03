-- AI result cache. Saves free-tier quota by dedup'ing identical prompts
-- across users (e.g. quiz generation on the same topic+level+n, or the
-- explanation for the same (question, chosen answer, level)).
--
-- `kind` tells the read path how to interpret `payload`:
--   'text'       — free-form chat reply
--   'json'       — strictly-validated JSON output (quiz items etc.)
--   'explanation'— short per-question explanation
--
-- `expires_at` is in unixepoch SECONDS. A simple `expires_at < now` filter
-- is enough; we rely on the index for cheap GC.

CREATE TABLE `ai_cache` (
  `cache_key` text PRIMARY KEY NOT NULL,
  `kind` text NOT NULL,
  `payload` text NOT NULL,
  `expires_at` integer NOT NULL,
  `created_at` integer NOT NULL DEFAULT (unixepoch())
);
--> statement-breakpoint
CREATE INDEX `ai_cache_expires_idx` ON `ai_cache` (`expires_at`);