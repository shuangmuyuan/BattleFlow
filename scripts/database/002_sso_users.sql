-- BattleFlow SSO user store bootstrap.
-- Run with: BATTLEFLOW_DATABASE_URL=... node scripts/apply-postgres-migration.mjs scripts/database/002_sso_users.sql

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE p.proname = 'battleflow_set_updated_at'
      AND n.nspname = current_schema()
      AND pg_get_function_identity_arguments(p.oid) = ''
  ) THEN
    EXECUTE $function$
      CREATE FUNCTION battleflow_set_updated_at()
      RETURNS trigger
      LANGUAGE plpgsql
      AS $body$
      BEGIN
        NEW.updated_at = now();
        RETURN NEW;
      END;
      $body$;
    $function$;
  END IF;
END;
$$;

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

UPDATE battleflow_users
SET sso_id = COALESCE(NULLIF(sso_id, ''), NULLIF(username, ''), NULLIF(email, ''), id)
WHERE NULLIF(sso_id, '') IS NULL;

UPDATE battleflow_users
SET username = COALESCE(NULLIF(username, ''), NULLIF(sso_id, ''), NULLIF(email, ''), id)
WHERE NULLIF(username, '') IS NULL;

UPDATE battleflow_users SET raw_profile = '{}'::jsonb WHERE raw_profile IS NULL;
UPDATE battleflow_users SET is_active = true WHERE is_active IS NULL;
UPDATE battleflow_users SET is_admin = false WHERE is_admin IS NULL;
UPDATE battleflow_users SET created_at = now() WHERE created_at IS NULL;

ALTER TABLE battleflow_users
  ALTER COLUMN sso_id SET NOT NULL,
  ALTER COLUMN username SET NOT NULL,
  ALTER COLUMN raw_profile SET NOT NULL,
  ALTER COLUMN is_active SET NOT NULL,
  ALTER COLUMN is_admin SET NOT NULL,
  ALTER COLUMN created_at SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS battleflow_users_sso_id_idx ON battleflow_users (sso_id);
CREATE INDEX IF NOT EXISTS battleflow_users_department_idx ON battleflow_users (department);
CREATE INDEX IF NOT EXISTS battleflow_users_email_idx ON battleflow_users (email);

DROP TRIGGER IF EXISTS battleflow_users_set_updated_at ON battleflow_users;
CREATE TRIGGER battleflow_users_set_updated_at
BEFORE UPDATE ON battleflow_users
FOR EACH ROW EXECUTE FUNCTION battleflow_set_updated_at();

UPDATE battleflow_users
SET is_admin = true
WHERE lower(email) = '94399@sangfor.com'
   OR sso_id = '94399'
   OR username = '94399';

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'battleflow') THEN
    GRANT SELECT, INSERT, UPDATE ON battleflow_users TO battleflow;
  END IF;
END;
$$;
