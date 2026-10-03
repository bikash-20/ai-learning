-- AI metadata for flash cards (nullable so existing rows are unaffected)
ALTER TABLE flash_card ADD COLUMN hint TEXT;
ALTER TABLE flash_card ADD COLUMN explanation TEXT;
ALTER TABLE flash_card ADD COLUMN tags TEXT NOT NULL DEFAULT '[]';      -- JSON array of strings
ALTER TABLE flash_card ADD COLUMN difficulty TEXT;                     -- 'easy' | 'hard'
ALTER TABLE flash_card ADD COLUMN ai_meta TEXT;                       -- JSON {provider, model, generatedAt}
