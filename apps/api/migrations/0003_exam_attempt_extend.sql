-- 0003_exam_attempt_extend.sql
-- Extend exam_attempt so we can run ad-hoc exams (no template) generated
-- from the MCQ bank. Existing rows get sensible defaults.

ALTER TABLE `exam_attempt` ADD COLUMN `item_ids` text NOT NULL DEFAULT '[]';
ALTER TABLE `exam_attempt` ADD COLUMN `answer_key` text NOT NULL DEFAULT '{}';
ALTER TABLE `exam_attempt` ADD COLUMN `kind` text NOT NULL DEFAULT 'ielts-mini-mock';
ALTER TABLE `exam_attempt` ADD COLUMN `level` text NOT NULL DEFAULT 'B2';
ALTER TABLE `exam_attempt` ADD COLUMN `difficulty` text NOT NULL DEFAULT 'hard';
ALTER TABLE `exam_attempt` ADD COLUMN `duration_sec` integer NOT NULL DEFAULT 0;

-- Make template_id nullable (it was NOT NULL before this migration).
-- SQLite stores NOT NULL as part of the column; we recreate the table to
-- drop the constraint while keeping the data. The column is still FK'd.
CREATE TABLE `exam_attempt_new` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL REFERENCES `user`(`id`) ON DELETE CASCADE,
  `template_id` text REFERENCES `exam_template`(`id`),
  `item_ids` text NOT NULL DEFAULT '[]',
  `answer_key` text NOT NULL DEFAULT '{}',
  `kind` text NOT NULL DEFAULT 'ielts-mini-mock',
  `level` text NOT NULL DEFAULT 'B2',
  `difficulty` text NOT NULL DEFAULT 'hard',
  `score` integer,
  `duration_sec` integer NOT NULL DEFAULT 0,
  `started_at` integer NOT NULL DEFAULT (unixepoch()),
  `finished_at` integer
);
INSERT INTO `exam_attempt_new` (id, user_id, template_id, item_ids, answer_key, kind, level, difficulty, score, duration_sec, started_at, finished_at)
SELECT id, user_id, template_id, item_ids, answer_key, kind, level, difficulty, score, duration_sec, started_at, finished_at FROM `exam_attempt`;
DROP TABLE `exam_attempt`;
ALTER TABLE `exam_attempt_new` RENAME TO `exam_attempt`;

CREATE INDEX `exam_attempt_user_idx` ON `exam_attempt` (`user_id`, `started_at`);