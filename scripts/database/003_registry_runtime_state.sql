-- BattleFlow registry runtime state migration.
-- This migration moves runtime registry data toward Postgres as the primary
-- source of truth while keeping file registries as import/backup compatibility.

ALTER TABLE skill_reviews
  ADD COLUMN IF NOT EXISTS payload jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;

UPDATE skill_reviews SET payload = '{}'::jsonb WHERE payload IS NULL;
UPDATE skill_reviews SET is_active = true WHERE is_active IS NULL;

ALTER TABLE skill_reviews
  ALTER COLUMN payload SET NOT NULL,
  ALTER COLUMN is_active SET NOT NULL;

CREATE INDEX IF NOT EXISTS skill_reviews_active_idx ON skill_reviews (is_active);

ALTER TABLE workflows
  ADD COLUMN IF NOT EXISTS state jsonb DEFAULT '{}'::jsonb;

UPDATE workflows SET state = '{}'::jsonb WHERE state IS NULL;

ALTER TABLE workflows
  ALTER COLUMN state SET NOT NULL;

CREATE INDEX IF NOT EXISTS workflows_updated_at_idx ON workflows (updated_at);
