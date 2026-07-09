-- BattleFlow detached chat run runtime state.
-- Run with: BATTLEFLOW_DATABASE_URL=... pnpm db:chat-runs:init

CREATE TABLE IF NOT EXISTS chat_runs (
  id varchar(64) PRIMARY KEY,
  organization_id varchar(36) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  workflow_id varchar(128) NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  step_id varchar(128) NOT NULL REFERENCES workflow_steps(id) ON DELETE CASCADE,
  status varchar(32) NOT NULL DEFAULT 'running',
  user_message text NOT NULL DEFAULT '',
  assistant_content text NOT NULL DEFAULT '',
  tool_calls jsonb NOT NULL DEFAULT '[]'::jsonb,
  error text,
  session_id varchar(128),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by varchar(36) REFERENCES users(id),
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chat_runs_status_check CHECK (status IN ('running', 'waiting_human', 'succeeded', 'failed', 'canceled'))
);

ALTER TABLE chat_runs
  ADD COLUMN IF NOT EXISTS organization_id varchar(36),
  ADD COLUMN IF NOT EXISTS workflow_id varchar(128),
  ADD COLUMN IF NOT EXISTS step_id varchar(128),
  ADD COLUMN IF NOT EXISTS status varchar(32) DEFAULT 'running',
  ADD COLUMN IF NOT EXISTS user_message text DEFAULT '',
  ADD COLUMN IF NOT EXISTS assistant_content text DEFAULT '',
  ADD COLUMN IF NOT EXISTS tool_calls jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS error text,
  ADD COLUMN IF NOT EXISTS session_id varchar(128),
  ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS created_by varchar(36),
  ADD COLUMN IF NOT EXISTS started_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

UPDATE chat_runs SET status = 'running' WHERE status IS NULL;
UPDATE chat_runs SET user_message = '' WHERE user_message IS NULL;
UPDATE chat_runs SET assistant_content = '' WHERE assistant_content IS NULL;
UPDATE chat_runs SET tool_calls = '[]'::jsonb WHERE tool_calls IS NULL;
UPDATE chat_runs SET metadata = '{}'::jsonb WHERE metadata IS NULL;
UPDATE chat_runs SET started_at = COALESCE(started_at, created_at, now()) WHERE started_at IS NULL;
UPDATE chat_runs SET created_at = now() WHERE created_at IS NULL;
UPDATE chat_runs SET updated_at = COALESCE(updated_at, created_at, now()) WHERE updated_at IS NULL;

ALTER TABLE chat_runs
  ALTER COLUMN organization_id SET NOT NULL,
  ALTER COLUMN workflow_id SET NOT NULL,
  ALTER COLUMN step_id SET NOT NULL,
  ALTER COLUMN status SET NOT NULL,
  ALTER COLUMN user_message SET NOT NULL,
  ALTER COLUMN assistant_content SET NOT NULL,
  ALTER COLUMN tool_calls SET NOT NULL,
  ALTER COLUMN metadata SET NOT NULL,
  ALTER COLUMN started_at SET NOT NULL,
  ALTER COLUMN created_at SET NOT NULL,
  ALTER COLUMN updated_at SET NOT NULL;

CREATE INDEX IF NOT EXISTS chat_runs_org_workflow_step_idx ON chat_runs (organization_id, workflow_id, step_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS chat_runs_workflow_status_idx ON chat_runs (workflow_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS chat_runs_updated_at_idx ON chat_runs (updated_at DESC);

CREATE TABLE IF NOT EXISTS chat_run_events (
  run_id varchar(64) NOT NULL REFERENCES chat_runs(id) ON DELETE CASCADE,
  sequence integer NOT NULL,
  event_type varchar(64) NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (run_id, sequence)
);

ALTER TABLE chat_run_events
  ADD COLUMN IF NOT EXISTS run_id varchar(64),
  ADD COLUMN IF NOT EXISTS sequence integer,
  ADD COLUMN IF NOT EXISTS event_type varchar(64),
  ADD COLUMN IF NOT EXISTS payload jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();

UPDATE chat_run_events SET payload = '{}'::jsonb WHERE payload IS NULL;
UPDATE chat_run_events SET created_at = now() WHERE created_at IS NULL;

ALTER TABLE chat_run_events
  ALTER COLUMN run_id SET NOT NULL,
  ALTER COLUMN sequence SET NOT NULL,
  ALTER COLUMN event_type SET NOT NULL,
  ALTER COLUMN payload SET NOT NULL,
  ALTER COLUMN created_at SET NOT NULL;

CREATE INDEX IF NOT EXISTS chat_run_events_created_at_idx ON chat_run_events (created_at);

DROP TRIGGER IF EXISTS chat_runs_set_updated_at ON chat_runs;
CREATE TRIGGER chat_runs_set_updated_at
BEFORE UPDATE ON chat_runs
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'battleflow') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON chat_runs TO battleflow;
    GRANT SELECT, INSERT, DELETE ON chat_run_events TO battleflow;
  END IF;
END $$;
