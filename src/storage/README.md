# `src/storage`

Supabase and database schema boundary.

## Contents

- `database/supabase-client.ts` loads environment configuration and creates server-side Supabase clients.
- `database/shared/schema.ts` defines Drizzle table schemas for organizations, Skills, workflows, workflow steps, snapshots, milestones, knowledge bases, and PRD documents.
- `database/shared/relations.ts` defines schema relations.

## Security Boundaries

- `COZE_SUPABASE_SERVICE_ROLE_KEY` is server-only.
- Browser code must use injected URL and anon key only.
- Do not expose service-role keys through route handlers.
- Keep auth/session checks explicit when routes mutate user or organization data.

## Schema Rules

- Preserve table names and relation semantics unless there is a migration plan.
- Add indexes for new query patterns.
- Keep JSON payload types explicit and narrow.

