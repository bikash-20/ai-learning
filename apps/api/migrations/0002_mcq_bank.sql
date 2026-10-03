-- 0002_mcq_bank.sql
-- Authored MCQ bank. The /api/quiz/from-topic route consults this table
-- first (matched by topic keyword + level) and only falls back to AI
-- generation when fewer than `n` matching items exist. This protects the
-- free-tier cascade quota and gives the user instant, well-tested
-- questions for the most common topics.

CREATE TABLE `mcq_bank` (
  `id` text PRIMARY KEY NOT NULL,
  `topic` text NOT NULL,            -- e.g. 'conditionals', 'articles'
  `level` text NOT NULL,            -- CEFR level (A2..C1)
  `difficulty` text NOT NULL,       -- 'easy' | 'hard' (mirrors HUB_TILES chips)
  `prompt` text NOT NULL,
  `options` text NOT NULL,          -- JSON-encoded string[4]
  `answer_idx` integer NOT NULL,
  `explanation` text NOT NULL,
  `tags` text NOT NULL DEFAULT '[]',-- JSON-encoded string[] (e.g. ['grammar','tense'])
  `created_at` integer NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX `mcq_bank_topic_level_idx` ON `mcq_bank` (`topic`, `level`);
CREATE INDEX `mcq_bank_difficulty_idx` ON `mcq_bank` (`difficulty`);