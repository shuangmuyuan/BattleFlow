-- BattleFlow account, organization, and authorization bootstrap.
-- Run with: BATTLEFLOW_DATABASE_URL=... pnpm db:accounts:init

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION battleflow_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TABLE IF NOT EXISTS users (
  id varchar(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
  email varchar(255) NOT NULL UNIQUE,
  display_name varchar(128),
  avatar_url text,
  status varchar(20) NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz
);

CREATE INDEX IF NOT EXISTS users_email_idx ON users (email);
CREATE INDEX IF NOT EXISTS users_status_idx ON users (status);

CREATE TABLE IF NOT EXISTS user_password_credentials (
  user_id varchar(36) PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  password_hash text NOT NULL,
  password_updated_at timestamptz NOT NULL DEFAULT now(),
  failed_attempt_count integer NOT NULL DEFAULT 0,
  locked_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz
);

CREATE TABLE IF NOT EXISTS user_sessions (
  id varchar(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id varchar(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_token_hash varchar(128) NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz,
  ip_hash varchar(128),
  user_agent_hash varchar(128)
);

CREATE INDEX IF NOT EXISTS user_sessions_user_id_idx ON user_sessions (user_id);
CREATE INDEX IF NOT EXISTS user_sessions_expires_at_idx ON user_sessions (expires_at);
CREATE INDEX IF NOT EXISTS user_sessions_revoked_at_idx ON user_sessions (revoked_at);

CREATE TABLE IF NOT EXISTS organizations (
  id varchar(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name varchar(128) NOT NULL,
  slug varchar(64) NOT NULL UNIQUE,
  description text,
  status varchar(20) NOT NULL DEFAULT 'active',
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by varchar(36) REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz
);

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS status varchar(20) DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS settings jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS created_by varchar(36);

UPDATE organizations SET status = 'active' WHERE status IS NULL;
UPDATE organizations SET settings = '{}'::jsonb WHERE settings IS NULL;

ALTER TABLE organizations
  ALTER COLUMN status SET NOT NULL,
  ALTER COLUMN settings SET NOT NULL;

CREATE INDEX IF NOT EXISTS organizations_slug_idx ON organizations (slug);
CREATE INDEX IF NOT EXISTS organizations_status_idx ON organizations (status);
CREATE INDEX IF NOT EXISTS organizations_created_by_idx ON organizations (created_by);

CREATE TABLE IF NOT EXISTS organization_members (
  id varchar(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
  organization_id varchar(36) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id varchar(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role varchar(20) NOT NULL DEFAULT 'org_member',
  status varchar(20) NOT NULL DEFAULT 'active',
  joined_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz
);

ALTER TABLE organization_members
  ADD COLUMN IF NOT EXISTS status varchar(20) DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS updated_at timestamptz;

CREATE INDEX IF NOT EXISTS org_members_org_id_idx ON organization_members (organization_id);
CREATE INDEX IF NOT EXISTS org_members_user_id_idx ON organization_members (user_id);
CREATE UNIQUE INDEX IF NOT EXISTS org_members_org_user_idx ON organization_members (organization_id, user_id);
CREATE INDEX IF NOT EXISTS org_members_status_idx ON organization_members (status);
CREATE INDEX IF NOT EXISTS org_members_role_idx ON organization_members (role);

CREATE TABLE IF NOT EXISTS departments (
  id varchar(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
  organization_id varchar(36) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  parent_department_id varchar(36) REFERENCES departments(id) ON DELETE SET NULL,
  name varchar(128) NOT NULL,
  slug varchar(64) NOT NULL,
  description text,
  created_by varchar(36) REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz
);

CREATE INDEX IF NOT EXISTS departments_org_id_idx ON departments (organization_id);
CREATE INDEX IF NOT EXISTS departments_parent_id_idx ON departments (parent_department_id);
CREATE UNIQUE INDEX IF NOT EXISTS departments_org_slug_idx ON departments (organization_id, slug);

CREATE TABLE IF NOT EXISTS department_members (
  id varchar(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
  department_id varchar(36) NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
  user_id varchar(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role varchar(24) NOT NULL DEFAULT 'department_member',
  joined_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS department_members_department_id_idx ON department_members (department_id);
CREATE INDEX IF NOT EXISTS department_members_user_id_idx ON department_members (user_id);
CREATE UNIQUE INDEX IF NOT EXISTS department_members_department_user_idx ON department_members (department_id, user_id);

CREATE TABLE IF NOT EXISTS teams (
  id varchar(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
  organization_id varchar(36) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  department_id varchar(36) REFERENCES departments(id) ON DELETE SET NULL,
  name varchar(128) NOT NULL,
  slug varchar(64) NOT NULL,
  description text,
  created_by varchar(36) REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz
);

CREATE INDEX IF NOT EXISTS teams_org_id_idx ON teams (organization_id);
CREATE INDEX IF NOT EXISTS teams_department_id_idx ON teams (department_id);
CREATE UNIQUE INDEX IF NOT EXISTS teams_org_slug_idx ON teams (organization_id, slug);

CREATE TABLE IF NOT EXISTS team_members (
  id varchar(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
  team_id varchar(36) NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id varchar(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role varchar(20) NOT NULL DEFAULT 'team_member',
  joined_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS team_members_team_id_idx ON team_members (team_id);
CREATE INDEX IF NOT EXISTS team_members_user_id_idx ON team_members (user_id);
CREATE UNIQUE INDEX IF NOT EXISTS team_members_team_user_idx ON team_members (team_id, user_id);

CREATE TABLE IF NOT EXISTS platform_admins (
  user_id varchar(36) PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  role varchar(20) NOT NULL DEFAULT 'super_admin',
  enabled boolean NOT NULL DEFAULT true,
  granted_by varchar(36) REFERENCES users(id),
  granted_at timestamptz NOT NULL DEFAULT now(),
  revoked_by varchar(36) REFERENCES users(id),
  revoked_at timestamptz
);

CREATE INDEX IF NOT EXISTS platform_admins_enabled_idx ON platform_admins (enabled);


CREATE TABLE IF NOT EXISTS skills (
  id varchar(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
  organization_id varchar(36) REFERENCES organizations(id) ON DELETE CASCADE,
  name varchar(128) NOT NULL,
  description text,
  version varchar(20) NOT NULL DEFAULT '1.0.0',
  scope varchar(20) NOT NULL DEFAULT 'personal',
  status varchar(24) NOT NULL DEFAULT 'imported',
  owner_user_id varchar(36) REFERENCES users(id),
  source_type varchar(20) NOT NULL DEFAULT 'local',
  source_uri text,
  asset_manifest jsonb NOT NULL DEFAULT '[]'::jsonb,
  definition jsonb NOT NULL,
  tags jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_by varchar(36),
  published_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz
);

ALTER TABLE skills
  ADD COLUMN IF NOT EXISTS status varchar(24) DEFAULT 'imported',
  ADD COLUMN IF NOT EXISTS owner_user_id varchar(36),
  ADD COLUMN IF NOT EXISTS asset_manifest jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS published_at timestamptz,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

UPDATE skills SET status = 'imported' WHERE status IS NULL;
UPDATE skills SET asset_manifest = '[]'::jsonb WHERE asset_manifest IS NULL;

ALTER TABLE skills
  ALTER COLUMN status SET NOT NULL,
  ALTER COLUMN asset_manifest SET NOT NULL;

CREATE INDEX IF NOT EXISTS skills_org_id_idx ON skills (organization_id);
CREATE INDEX IF NOT EXISTS skills_scope_idx ON skills (scope);
CREATE INDEX IF NOT EXISTS skills_status_idx ON skills (status);
CREATE INDEX IF NOT EXISTS skills_owner_user_id_idx ON skills (owner_user_id);
CREATE INDEX IF NOT EXISTS skills_created_by_idx ON skills (created_by);

CREATE TABLE IF NOT EXISTS skill_versions (
  id varchar(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
  skill_id varchar(36) NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  version varchar(20) NOT NULL,
  definition jsonb NOT NULL,
  asset_manifest jsonb NOT NULL DEFAULT '[]'::jsonb,
  changelog_note text,
  created_by varchar(36) REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS skill_versions_skill_id_idx ON skill_versions (skill_id);
CREATE UNIQUE INDEX IF NOT EXISTS skill_versions_skill_version_idx ON skill_versions (skill_id, version);

CREATE TABLE IF NOT EXISTS skill_reviews (
  id varchar(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
  skill_id varchar(36) NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  version_id varchar(36) REFERENCES skill_versions(id) ON DELETE SET NULL,
  status varchar(24) NOT NULL DEFAULT 'pending_review',
  note text,
  requested_by varchar(36) REFERENCES users(id),
  reviewed_by varchar(36) REFERENCES users(id),
  requested_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz
);

CREATE INDEX IF NOT EXISTS skill_reviews_skill_id_idx ON skill_reviews (skill_id);
CREATE INDEX IF NOT EXISTS skill_reviews_status_idx ON skill_reviews (status);

CREATE TABLE IF NOT EXISTS skill_assets (
  id varchar(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
  skill_id varchar(36) NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  version_id varchar(36) REFERENCES skill_versions(id) ON DELETE SET NULL,
  path text NOT NULL,
  uri text,
  content_type varchar(128),
  size_bytes integer,
  checksum varchar(128),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS skill_assets_skill_id_idx ON skill_assets (skill_id);
CREATE INDEX IF NOT EXISTS skill_assets_version_id_idx ON skill_assets (version_id);
CREATE INDEX IF NOT EXISTS skill_assets_checksum_idx ON skill_assets (checksum);

CREATE TABLE IF NOT EXISTS workflow_workspaces (
  id varchar(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
  organization_id varchar(36) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name varchar(160) NOT NULL,
  description text,
  created_by varchar(36) REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz
);

CREATE INDEX IF NOT EXISTS workflow_workspaces_org_id_idx ON workflow_workspaces (organization_id);
CREATE INDEX IF NOT EXISTS workflow_workspaces_created_by_idx ON workflow_workspaces (created_by);

CREATE TABLE IF NOT EXISTS workflows (
  id varchar(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
  workspace_id varchar(36) REFERENCES workflow_workspaces(id) ON DELETE SET NULL,
  organization_id varchar(36) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name varchar(200) NOT NULL,
  description text,
  status varchar(20) NOT NULL DEFAULT 'draft',
  current_step_index integer DEFAULT 0,
  model_id varchar(64) DEFAULT 'doubao-seed-2-0-pro-260215',
  created_by varchar(36) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz
);

ALTER TABLE workflows
  ADD COLUMN IF NOT EXISTS workspace_id varchar(36);

CREATE INDEX IF NOT EXISTS workflows_org_id_idx ON workflows (organization_id);
CREATE INDEX IF NOT EXISTS workflows_workspace_id_idx ON workflows (workspace_id);
CREATE INDEX IF NOT EXISTS workflows_created_by_idx ON workflows (created_by);
CREATE INDEX IF NOT EXISTS workflows_status_idx ON workflows (status);

CREATE TABLE IF NOT EXISTS workflow_steps (
  id varchar(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
  workflow_id varchar(36) NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  skill_id varchar(36) REFERENCES skills(id),
  step_index integer NOT NULL,
  name varchar(200) NOT NULL,
  description text,
  status varchar(20) NOT NULL DEFAULT 'pending',
  output text,
  accumulated_context jsonb,
  conversation jsonb,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz
);

CREATE INDEX IF NOT EXISTS workflow_steps_workflow_id_idx ON workflow_steps (workflow_id);
CREATE INDEX IF NOT EXISTS workflow_steps_skill_id_idx ON workflow_steps (skill_id);

CREATE TABLE IF NOT EXISTS step_snapshots (
  id varchar(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
  step_id varchar(36) NOT NULL REFERENCES workflow_steps(id) ON DELETE CASCADE,
  workflow_id varchar(36) NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  output text NOT NULL,
  conversation jsonb,
  snapshot_type varchar(20) NOT NULL DEFAULT 'auto',
  label varchar(128),
  created_by varchar(36),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS step_snapshots_step_id_idx ON step_snapshots (step_id);
CREATE INDEX IF NOT EXISTS step_snapshots_workflow_id_idx ON step_snapshots (workflow_id);

CREATE TABLE IF NOT EXISTS workflow_snapshots (
  id varchar(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
  workflow_id varchar(36) NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  snapshot jsonb NOT NULL,
  snapshot_type varchar(20) NOT NULL DEFAULT 'auto',
  label varchar(128),
  created_by varchar(36),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS workflow_snapshots_workflow_id_idx ON workflow_snapshots (workflow_id);

CREATE TABLE IF NOT EXISTS milestones (
  id varchar(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
  workflow_id varchar(36) NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  workflow_snapshot_id varchar(36) REFERENCES workflow_snapshots(id),
  step_snapshot_id varchar(36) REFERENCES step_snapshots(id),
  name varchar(128) NOT NULL,
  description text,
  milestone_type varchar(20) NOT NULL DEFAULT 'manual',
  created_by varchar(36),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS milestones_workflow_id_idx ON milestones (workflow_id);

CREATE TABLE IF NOT EXISTS prd_documents (
  id varchar(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
  workflow_id varchar(36) NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  organization_id varchar(36) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  title varchar(200) NOT NULL,
  content text NOT NULL,
  version varchar(20) NOT NULL DEFAULT '1.0.0',
  created_by varchar(36),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz
);

CREATE INDEX IF NOT EXISTS prd_documents_workflow_id_idx ON prd_documents (workflow_id);
CREATE INDEX IF NOT EXISTS prd_documents_org_id_idx ON prd_documents (organization_id);

CREATE TABLE IF NOT EXISTS workflow_assets (
  id varchar(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
  workflow_id varchar(36) NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  asset_type varchar(32) NOT NULL,
  path text,
  uri text,
  content_type varchar(128),
  size_bytes integer,
  checksum varchar(128),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by varchar(36) REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS workflow_assets_workflow_id_idx ON workflow_assets (workflow_id);
CREATE INDEX IF NOT EXISTS workflow_assets_type_idx ON workflow_assets (asset_type);

CREATE TABLE IF NOT EXISTS resource_access_grants (
  id varchar(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
  organization_id varchar(36) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  resource_type varchar(40) NOT NULL,
  resource_id varchar(128) NOT NULL,
  subject_type varchar(24) NOT NULL,
  subject_id varchar(128) NOT NULL,
  permission varchar(24) NOT NULL,
  created_by varchar(36) REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz
);

CREATE INDEX IF NOT EXISTS resource_grants_org_idx ON resource_access_grants (organization_id);
CREATE INDEX IF NOT EXISTS resource_grants_resource_idx ON resource_access_grants (resource_type, resource_id);
CREATE INDEX IF NOT EXISTS resource_grants_subject_idx ON resource_access_grants (subject_type, subject_id);
CREATE UNIQUE INDEX IF NOT EXISTS resource_grants_unique_idx ON resource_access_grants (
  organization_id,
  resource_type,
  resource_id,
  subject_type,
  subject_id,
  permission
);
CREATE INDEX IF NOT EXISTS resource_grants_permission_idx ON resource_access_grants (permission);

CREATE TABLE IF NOT EXISTS audit_events (
  id varchar(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
  organization_id varchar(36) REFERENCES organizations(id) ON DELETE SET NULL,
  actor_user_id varchar(36) REFERENCES users(id) ON DELETE SET NULL,
  action varchar(96) NOT NULL,
  target_type varchar(64) NOT NULL,
  target_id varchar(128),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS audit_events_org_id_idx ON audit_events (organization_id);
CREATE INDEX IF NOT EXISTS audit_events_actor_idx ON audit_events (actor_user_id);
CREATE INDEX IF NOT EXISTS audit_events_action_idx ON audit_events (action);
CREATE INDEX IF NOT EXISTS audit_events_target_idx ON audit_events (target_type, target_id);
CREATE INDEX IF NOT EXISTS audit_events_created_at_idx ON audit_events (created_at);

DROP TRIGGER IF EXISTS users_set_updated_at ON users;
CREATE TRIGGER users_set_updated_at
BEFORE UPDATE ON users
FOR EACH ROW EXECUTE FUNCTION battleflow_set_updated_at();

DROP TRIGGER IF EXISTS user_password_credentials_set_updated_at ON user_password_credentials;
CREATE TRIGGER user_password_credentials_set_updated_at
BEFORE UPDATE ON user_password_credentials
FOR EACH ROW EXECUTE FUNCTION battleflow_set_updated_at();

DROP TRIGGER IF EXISTS organizations_set_updated_at ON organizations;
CREATE TRIGGER organizations_set_updated_at
BEFORE UPDATE ON organizations
FOR EACH ROW EXECUTE FUNCTION battleflow_set_updated_at();

DROP TRIGGER IF EXISTS organization_members_set_updated_at ON organization_members;
CREATE TRIGGER organization_members_set_updated_at
BEFORE UPDATE ON organization_members
FOR EACH ROW EXECUTE FUNCTION battleflow_set_updated_at();

DROP TRIGGER IF EXISTS departments_set_updated_at ON departments;
CREATE TRIGGER departments_set_updated_at
BEFORE UPDATE ON departments
FOR EACH ROW EXECUTE FUNCTION battleflow_set_updated_at();

DROP TRIGGER IF EXISTS teams_set_updated_at ON teams;
CREATE TRIGGER teams_set_updated_at
BEFORE UPDATE ON teams
FOR EACH ROW EXECUTE FUNCTION battleflow_set_updated_at();

DROP TRIGGER IF EXISTS skills_set_updated_at ON skills;
CREATE TRIGGER skills_set_updated_at
BEFORE UPDATE ON skills
FOR EACH ROW EXECUTE FUNCTION battleflow_set_updated_at();

DROP TRIGGER IF EXISTS workflow_workspaces_set_updated_at ON workflow_workspaces;
CREATE TRIGGER workflow_workspaces_set_updated_at
BEFORE UPDATE ON workflow_workspaces
FOR EACH ROW EXECUTE FUNCTION battleflow_set_updated_at();

DROP TRIGGER IF EXISTS workflows_set_updated_at ON workflows;
CREATE TRIGGER workflows_set_updated_at
BEFORE UPDATE ON workflows
FOR EACH ROW EXECUTE FUNCTION battleflow_set_updated_at();

DROP TRIGGER IF EXISTS workflow_steps_set_updated_at ON workflow_steps;
CREATE TRIGGER workflow_steps_set_updated_at
BEFORE UPDATE ON workflow_steps
FOR EACH ROW EXECUTE FUNCTION battleflow_set_updated_at();

DROP TRIGGER IF EXISTS prd_documents_set_updated_at ON prd_documents;
CREATE TRIGGER prd_documents_set_updated_at
BEFORE UPDATE ON prd_documents
FOR EACH ROW EXECUTE FUNCTION battleflow_set_updated_at();

DROP TRIGGER IF EXISTS resource_access_grants_set_updated_at ON resource_access_grants;
CREATE TRIGGER resource_access_grants_set_updated_at
BEFORE UPDATE ON resource_access_grants
FOR EACH ROW EXECUTE FUNCTION battleflow_set_updated_at();

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'battleflow') THEN
    GRANT USAGE ON SCHEMA public TO battleflow;

    GRANT SELECT, INSERT, UPDATE ON users TO battleflow;
    GRANT SELECT, INSERT, UPDATE ON user_password_credentials TO battleflow;
    GRANT SELECT, INSERT, UPDATE ON user_sessions TO battleflow;
    GRANT SELECT, INSERT, UPDATE ON organizations TO battleflow;
    GRANT SELECT, INSERT, UPDATE, DELETE ON organization_members TO battleflow;
    GRANT SELECT, INSERT, UPDATE, DELETE ON departments TO battleflow;
    GRANT SELECT, INSERT, DELETE ON department_members TO battleflow;
    GRANT SELECT, INSERT, UPDATE, DELETE ON teams TO battleflow;
    GRANT SELECT, INSERT, DELETE ON team_members TO battleflow;
    GRANT SELECT, INSERT, UPDATE ON platform_admins TO battleflow;
    GRANT SELECT, INSERT, UPDATE, DELETE ON skills TO battleflow;
    GRANT SELECT, INSERT, UPDATE, DELETE ON skill_versions TO battleflow;
    GRANT SELECT, INSERT, UPDATE, DELETE ON skill_reviews TO battleflow;
    GRANT SELECT, INSERT, UPDATE, DELETE ON skill_assets TO battleflow;
    GRANT SELECT, INSERT, UPDATE, DELETE ON workflow_workspaces TO battleflow;
    GRANT SELECT, INSERT, UPDATE, DELETE ON workflows TO battleflow;
    GRANT SELECT, INSERT, UPDATE, DELETE ON workflow_steps TO battleflow;
    GRANT SELECT, INSERT, DELETE ON step_snapshots TO battleflow;
    GRANT SELECT, INSERT, DELETE ON workflow_snapshots TO battleflow;
    GRANT SELECT, INSERT, DELETE ON milestones TO battleflow;
    GRANT SELECT, INSERT, UPDATE, DELETE ON workflow_assets TO battleflow;
    IF to_regclass('public.knowledge_bases') IS NOT NULL THEN
      GRANT SELECT, INSERT, UPDATE ON knowledge_bases TO battleflow;
    END IF;

    IF to_regclass('public.knowledge_documents') IS NOT NULL THEN
      GRANT SELECT, INSERT, UPDATE ON knowledge_documents TO battleflow;
    END IF;
    GRANT SELECT, INSERT, UPDATE, DELETE ON prd_documents TO battleflow;
    GRANT SELECT, INSERT, UPDATE, DELETE ON resource_access_grants TO battleflow;
    GRANT SELECT, INSERT ON audit_events TO battleflow;
  END IF;
END;
$$;
