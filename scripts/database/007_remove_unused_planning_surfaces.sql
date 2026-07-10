BEGIN;

DELETE FROM resource_access_grants
WHERE resource_type = 'prd_document';

ALTER TABLE IF EXISTS knowledge_bases
  DROP COLUMN IF EXISTS source_type,
  DROP COLUMN IF EXISTS connection_config;

UPDATE skills
SET source_type = 'local'
WHERE source_type IS DISTINCT FROM 'local';

DROP TABLE IF EXISTS milestones;
DROP TABLE IF EXISTS workflow_snapshots;
DROP TABLE IF EXISTS step_snapshots;
DROP TABLE IF EXISTS prd_documents;

COMMIT;
