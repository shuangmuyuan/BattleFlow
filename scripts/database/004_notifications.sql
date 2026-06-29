-- BattleFlow user notification store bootstrap.
-- Run with: BATTLEFLOW_DATABASE_URL=... node scripts/apply-postgres-migration.mjs scripts/database/004_notifications.sql

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS app_notifications (
  id varchar(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
  recipient_user_id varchar(36) REFERENCES users(id) ON DELETE CASCADE,
  recipient_battleflow_user_id varchar(36) REFERENCES battleflow_users(id) ON DELETE CASCADE,
  actor_user_id varchar(36) REFERENCES users(id) ON DELETE SET NULL,
  notification_type varchar(80) NOT NULL,
  title varchar(160) NOT NULL,
  body text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE app_notifications
  ADD COLUMN IF NOT EXISTS recipient_user_id varchar(36),
  ADD COLUMN IF NOT EXISTS recipient_battleflow_user_id varchar(36),
  ADD COLUMN IF NOT EXISTS actor_user_id varchar(36),
  ADD COLUMN IF NOT EXISTS notification_type varchar(80),
  ADD COLUMN IF NOT EXISTS title varchar(160),
  ADD COLUMN IF NOT EXISTS body text,
  ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS read_at timestamptz,
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();

UPDATE app_notifications SET metadata = '{}'::jsonb WHERE metadata IS NULL;
UPDATE app_notifications SET created_at = now() WHERE created_at IS NULL;

ALTER TABLE app_notifications
  ALTER COLUMN notification_type SET NOT NULL,
  ALTER COLUMN title SET NOT NULL,
  ALTER COLUMN metadata SET NOT NULL,
  ALTER COLUMN created_at SET NOT NULL;

ALTER TABLE app_notifications
  DROP CONSTRAINT IF EXISTS app_notifications_recipient_check;

ALTER TABLE app_notifications
  ADD CONSTRAINT app_notifications_recipient_check
  CHECK (
    (CASE WHEN recipient_user_id IS NULL THEN 0 ELSE 1 END)
    + (CASE WHEN recipient_battleflow_user_id IS NULL THEN 0 ELSE 1 END)
    = 1
  );

CREATE INDEX IF NOT EXISTS app_notifications_user_idx
  ON app_notifications (recipient_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS app_notifications_battleflow_user_idx
  ON app_notifications (recipient_battleflow_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS app_notifications_unread_user_idx
  ON app_notifications (recipient_user_id, read_at)
  WHERE read_at IS NULL;

CREATE INDEX IF NOT EXISTS app_notifications_unread_battleflow_user_idx
  ON app_notifications (recipient_battleflow_user_id, read_at)
  WHERE read_at IS NULL;

CREATE INDEX IF NOT EXISTS app_notifications_type_idx
  ON app_notifications (notification_type);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'battleflow') THEN
    GRANT SELECT, INSERT, UPDATE ON app_notifications TO battleflow;
  END IF;
END;
$$;
