-- BattleFlow SSO user store bootstrap.
-- Run with: BATTLEFLOW_DATABASE_URL=... node scripts/apply-postgres-migration.mjs scripts/database/002_sso_users.sql

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS battleflow_users (
  id varchar(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
  sso_id varchar(255) NOT NULL UNIQUE,
  username varchar(255) NOT NULL,
  display_name varchar(255),
  email varchar(255),
  department varchar(255),
  department_id varchar(255),
  title varchar(255),
  mobile varchar(64),
  raw_profile jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  is_admin boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz
);

ALTER TABLE battleflow_users
  ADD COLUMN IF NOT EXISTS sso_id varchar(255),
  ADD COLUMN IF NOT EXISTS username varchar(255),
  ADD COLUMN IF NOT EXISTS display_name varchar(255),
  ADD COLUMN IF NOT EXISTS email varchar(255),
  ADD COLUMN IF NOT EXISTS department varchar(255),
  ADD COLUMN IF NOT EXISTS department_id varchar(255),
  ADD COLUMN IF NOT EXISTS title varchar(255),
  ADD COLUMN IF NOT EXISTS mobile varchar(64),
  ADD COLUMN IF NOT EXISTS raw_profile jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS is_admin boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS battleflow_users_sso_id_idx ON battleflow_users (sso_id);
CREATE INDEX IF NOT EXISTS battleflow_users_department_idx ON battleflow_users (department);
CREATE INDEX IF NOT EXISTS battleflow_users_email_idx ON battleflow_users (email);

DROP TRIGGER IF EXISTS battleflow_users_set_updated_at ON battleflow_users;
CREATE TRIGGER battleflow_users_set_updated_at
BEFORE UPDATE ON battleflow_users
FOR EACH ROW EXECUTE FUNCTION battleflow_set_updated_at();
