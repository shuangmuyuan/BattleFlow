# `src/storage`

Database and schema boundary.

## Contents

- `database/supabase-client.ts` loads environment configuration and creates server-side Supabase clients for Supabase-backed routes.
- `database/postgres-client.ts` creates a server-side Postgres pool from `BATTLEFLOW_DATABASE_URL`.
- `database/shared/schema.ts` defines Drizzle table schemas for first-party users, sessions, organizations, organization members, departments, teams, platform admins, invitations, resource grants, audit events, Skills, workflows, workflow steps, snapshots, milestones, knowledge bases, knowledge documents, and PRD documents.
- `database/shared/relations.ts` defines schema relations.

## Security Boundaries

- `BATTLEFLOW_SUPABASE_SERVICE_ROLE_KEY` is server-only.
- `BATTLEFLOW_DATABASE_URL` is server-only and must never be exposed to browser components or public config endpoints.
- Browser code must use injected URL and anon key only.
- Do not expose service-role keys through route handlers.
- Do not log database connection strings.
- Keep auth/session checks explicit when routes read or mutate user, organization, or grantable resource data.
- Store only password hashes, session token hashes, and invitation token hashes. Never log or return plaintext tokens.

## Schema Rules

- Preserve table names and relation semantics unless there is a migration plan.
- Add indexes for new query patterns.
- Keep JSON payload types explicit and narrow.
- Use `scripts/database/*.sql` plus `pnpm db:postgres:init` for fresh direct-Postgres bootstraps.
- Use `pnpm db:knowledge:init` when only applying the knowledge-store bootstrap.
- Use `pnpm db:accounts:init` after the knowledge bootstrap to add first-party account, organization, permission, and Skill/workflow business metadata tables.
- Use `pnpm db:resources:migrate` after account/bootstrap migrations when an environment already has file-backed Skill or workflow runtime data that needs Postgres resource permission rows.
