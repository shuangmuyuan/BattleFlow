# `src/storage`

Database and schema boundary.

## Contents

- `database/postgres-client.ts` creates a server-side Postgres pool from `BATTLEFLOW_DATABASE_URL`.

## Security Boundaries

- `BATTLEFLOW_DATABASE_URL` is server-only and must never be exposed to browser components or public config endpoints.
- Do not log database connection strings.
- Keep auth/session checks explicit when routes mutate user or organization data.

## Schema Rules

- Preserve table names and relation semantics unless there is a migration plan.
- Add indexes for new query patterns.
- Keep JSON payload types explicit and narrow.
- Use `scripts/database/*.sql` plus `pnpm db:knowledge:init` for the direct Postgres knowledge-store bootstrap.
