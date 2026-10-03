-- 0006_user_role.sql
-- Add a `role` column to the user table so admin-only API routes and
-- UI surfaces can be gated server-side instead of trusting a build-time
-- env var. Default 'user'; only one row is promoted to 'admin' by hand.

ALTER TABLE `user` ADD COLUMN `role` text NOT NULL DEFAULT 'user';

-- Promote the founder's account. Idempotent: re-runs are a no-op because
-- we filter on email first.
UPDATE `user` SET `role` = 'admin' WHERE `email` = 'bikashtalukder040@gmail.com';

CREATE INDEX `user_role_idx` ON `user`(`role`);