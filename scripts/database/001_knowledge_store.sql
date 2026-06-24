-- BattleFlow knowledge store bootstrap.
-- Run with: BATTLEFLOW_DATABASE_URL=... pnpm db:knowledge:init

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE IF NOT EXISTS organizations (
  id varchar(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name varchar(128) NOT NULL,
  slug varchar(64) NOT NULL UNIQUE,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz
);

CREATE INDEX IF NOT EXISTS organizations_slug_idx ON organizations (slug);

INSERT INTO organizations (id, name, slug, description, created_at, updated_at)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'Default Organization',
  'default',
  'Default BattleFlow organization for single-tenant local and remote runtimes.',
  now(),
  now()
)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS knowledge_bases (
  id varchar(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
  organization_id varchar(36) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name varchar(128) NOT NULL,
  description text,
  source_type varchar(20) NOT NULL DEFAULT 'builtin',
  connection_config jsonb,
  dataset_name varchar(128),
  is_active boolean NOT NULL DEFAULT true,
  created_by varchar(36),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz
);

ALTER TABLE knowledge_bases
  ADD COLUMN IF NOT EXISTS organization_id varchar(36),
  ADD COLUMN IF NOT EXISTS name varchar(128),
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS source_type varchar(20) DEFAULT 'builtin',
  ADD COLUMN IF NOT EXISTS connection_config jsonb,
  ADD COLUMN IF NOT EXISTS dataset_name varchar(128),
  ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS created_by varchar(36),
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz;

CREATE INDEX IF NOT EXISTS knowledge_bases_org_id_idx ON knowledge_bases (organization_id);
CREATE INDEX IF NOT EXISTS knowledge_bases_active_idx ON knowledge_bases (is_active, updated_at DESC);

CREATE TABLE IF NOT EXISTS knowledge_documents (
  id varchar(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
  knowledge_base_id varchar(36) NOT NULL REFERENCES knowledge_bases(id) ON DELETE CASCADE,
  title varchar(200),
  source_type varchar(32) NOT NULL DEFAULT 'manual',
  source text,
  content text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  search_vector tsvector GENERATED ALWAYS AS (
    to_tsvector(
      'simple',
      coalesce(title, '') || ' ' || coalesce(source, '') || ' ' || coalesce(content, '')
    )
  ) STORED,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz
);

ALTER TABLE knowledge_documents
  ADD COLUMN IF NOT EXISTS knowledge_base_id varchar(36),
  ADD COLUMN IF NOT EXISTS title varchar(200),
  ADD COLUMN IF NOT EXISTS source_type varchar(32) DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS source text,
  ADD COLUMN IF NOT EXISTS content text,
  ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS search_vector tsvector GENERATED ALWAYS AS (
    to_tsvector(
      'simple',
      coalesce(title, '') || ' ' || coalesce(source, '') || ' ' || coalesce(content, '')
    )
  ) STORED,
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz;

CREATE INDEX IF NOT EXISTS knowledge_documents_kb_id_idx ON knowledge_documents (knowledge_base_id);
CREATE INDEX IF NOT EXISTS knowledge_documents_created_at_idx ON knowledge_documents (created_at DESC);
CREATE INDEX IF NOT EXISTS knowledge_documents_search_vector_idx ON knowledge_documents USING gin (search_vector);
CREATE INDEX IF NOT EXISTS knowledge_documents_content_trgm_idx ON knowledge_documents USING gin (content gin_trgm_ops);
CREATE INDEX IF NOT EXISTS knowledge_documents_title_trgm_idx ON knowledge_documents USING gin (title gin_trgm_ops);

CREATE OR REPLACE FUNCTION battleflow_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS organizations_set_updated_at ON organizations;
CREATE TRIGGER organizations_set_updated_at
BEFORE UPDATE ON organizations
FOR EACH ROW EXECUTE FUNCTION battleflow_set_updated_at();

DROP TRIGGER IF EXISTS knowledge_bases_set_updated_at ON knowledge_bases;
CREATE TRIGGER knowledge_bases_set_updated_at
BEFORE UPDATE ON knowledge_bases
FOR EACH ROW EXECUTE FUNCTION battleflow_set_updated_at();

DROP TRIGGER IF EXISTS knowledge_documents_set_updated_at ON knowledge_documents;
CREATE TRIGGER knowledge_documents_set_updated_at
BEFORE UPDATE ON knowledge_documents
FOR EACH ROW EXECUTE FUNCTION battleflow_set_updated_at();

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'battleflow') THEN
    GRANT USAGE ON SCHEMA public TO battleflow;
    REVOKE INSERT, UPDATE, DELETE ON organizations FROM battleflow;
    GRANT SELECT ON organizations TO battleflow;
    GRANT SELECT, INSERT, UPDATE ON knowledge_bases TO battleflow;
    GRANT SELECT, INSERT, UPDATE ON knowledge_documents TO battleflow;
  END IF;
END;
$$;
