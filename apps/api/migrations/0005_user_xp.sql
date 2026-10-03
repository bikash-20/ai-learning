-- 0005_user_xp.sql
-- Add `xp` column to the user table. Better Auth's table only ships
-- with the standard identity columns; XP is a Quantara-specific total
-- across quiz correct answers, exam bands, and flashcard reviews.

ALTER TABLE `user` ADD COLUMN `xp` integer NOT NULL DEFAULT 0;