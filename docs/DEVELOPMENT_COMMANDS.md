# Development Commands

Use pnpm only.

## Install

```bash
pnpm install
```

## Development

```bash
pnpm dev
```

`scripts/dev.sh` clears the selected port before starting. The default port is `5000`; override it with `DEPLOY_RUN_PORT` or `PORT`.

## Validation

```bash
pnpm ts-check
pnpm lint:build
pnpm check:overlays
pnpm check:responsive
pnpm test
pnpm validate
```

`pnpm validate` runs type-check, lint, overlay, and responsive gates in parallel. Run `pnpm test` for Vitest coverage of workflow validation, auth, permission, resource metadata, and server utility behavior.

## Build

```bash
pnpm build
```

The build script:

1. runs `pnpm install --prefer-frozen-lockfile --prefer-offline --loglevel debug --reporter=append-only`;
2. runs `pnpm next build`;
3. bundles `src/server.ts` with `pnpm tsup`.

## Production Start

```bash
BATTLEFLOW_PROJECT_ENV=PROD DEPLOY_RUN_PORT=5100 pnpm start
```

`scripts/start.sh` runs `node dist/server.js`, so `pnpm build` must run first.

## Database Bootstrap

```bash
BATTLEFLOW_DATABASE_URL=postgresql://... pnpm db:knowledge:init
BATTLEFLOW_DATABASE_URL=postgresql://... pnpm db:accounts:init
BATTLEFLOW_DATABASE_URL=postgresql://... BATTLEFLOW_MIGRATION_ORGANIZATION_ID=... BATTLEFLOW_MIGRATION_USER_ID=... pnpm db:resources:migrate
BATTLEFLOW_DATABASE_URL=postgresql://... pnpm db:postgres:init
```

`pnpm db:knowledge:init` applies the direct Postgres knowledge-store bootstrap in `scripts/database/001_knowledge_store.sql`.

`pnpm db:accounts:init` applies `scripts/database/002_account_org_permissions.sql`, which adds first-party users, password credential storage, sessions, organization members, departments, teams, platform admins, resource grants, audit events, and Skill/workflow business metadata needed by the authorization system.

`pnpm db:postgres:init` runs both scripts in order. Use it for a fresh direct-Postgres BattleFlow database.

`pnpm db:resources:migrate` reads existing `data/skill-registry/index.json`, official Skill seed metadata, and `data/workflows/store.json`, then writes Skill/workflow business metadata and resource owner grants into Postgres. It does not execute imported package scripts or move large package assets into the database; Postgres stores metadata, state indexes, and asset manifests only.

For non-official historical Skill/workflow data, set `BATTLEFLOW_MIGRATION_ORGANIZATION_ID` or `BATTLEFLOW_DEFAULT_ORGANIZATION_ID` plus `BATTLEFLOW_MIGRATION_USER_ID` before running the migration. Without the backfill, protected routes intentionally hide historical file-backed resources that do not have Postgres permission rows.

See `docs/ACCOUNT_ORG_PERMISSION_RUNBOOK.md` for the full first-party auth, organization, super admin, and resource-permission operational sequence.

## Super Admin Bootstrap

Configure at least one server-only bootstrap principal before the first platform-admin sign-in:

```bash
BATTLEFLOW_SUPER_ADMIN_EMAILS=owner@example.com pnpm dev
# or
BATTLEFLOW_SUPER_ADMIN_USER_IDS=user-id-1,user-id-2 pnpm dev
```

Values are comma-separated. They are read only on the server while resolving the current authenticated user. After the matching user signs in and calls `/api/auth/me` or opens the dashboard, BattleFlow upserts an enabled `platform_admins` row and writes an audit event without returning the configured values to the browser.

Use `/dashboard/admin` as an enabled super admin to grant or revoke additional super admins. The management API prevents revoking the last enabled super admin.

## Demo Handoff Integration

Configure the external Frieren Demo platform only on the server:

```bash
FRIEREN_DEMO_BASE_URL=http://ui.sangfor.com.cn/
FRIEREN_DEMO_HMAC_SECRET=replace-with-shared-secret
```

The local route is `POST /api/demos/handoffs` with `{ workflowId, stepId }`. It signs and forwards the completed step output to `POST {FRIEREN_DEMO_BASE_URL}/api/integrations/workflows/handoff`, then stores the returned Demo link on the workflow node. Internal integration environments may use HTTP during joint testing; production should use HTTPS.

## Useful Environment Variables

| Variable | Purpose |
| --- | --- |
| `BATTLEFLOW_PROJECT_ENV` | `DEV` for development, `PROD` for production mode. |
| `DEPLOY_RUN_PORT` | HTTP port used by scripts. |
| `HOSTNAME` | Server hostname, defaults to `localhost`. |
| `BATTLEFLOW_SUPABASE_URL` | Supabase project URL. |
| `BATTLEFLOW_SUPABASE_ANON_KEY` | Browser-safe Supabase anon key. |
| `BATTLEFLOW_SUPABASE_SERVICE_ROLE_KEY` | Server-only privileged Supabase key. |
| `BATTLEFLOW_DATABASE_URL` | Server-only direct Postgres connection string for knowledge-store, account, organization, and authorization operations. |
| `BATTLEFLOW_DEFAULT_ORGANIZATION_ID` | Default organization used by single-tenant knowledge operations. |
| `BATTLEFLOW_DATABASE_POOL_MAX` | Optional Postgres pool size, defaults to `5`. |
| `BATTLEFLOW_DATABASE_SSL` | Optional Postgres SSL mode. Use `true` or `require` to enable SSL. |
| `BATTLEFLOW_SUPER_ADMIN_EMAILS` | Server-only comma-separated emails that bootstrap matching signed-in users as super admins. |
| `BATTLEFLOW_SUPER_ADMIN_USER_IDS` | Server-only comma-separated user IDs that bootstrap matching signed-in users as super admins. |
| `BATTLEFLOW_MIGRATION_ORGANIZATION_ID` | Organization ID used by `pnpm db:resources:migrate` when backfilling non-official Skill/workflow metadata. |
| `BATTLEFLOW_MIGRATION_USER_ID` | User ID used by `pnpm db:resources:migrate` as the owner/admin grant for backfilled runtime resources. |
| `FRIEREN_DEMO_BASE_URL` | Server-only external Demo platform base URL. Use a trailing slash or no trailing slash; the client normalizes paths. |
| `FRIEREN_DEMO_HMAC_SECRET` | Server-only shared HMAC secret for Frieren Demo integration requests. Never expose to the browser or commit real values. |
| `SKILL_REGISTRY_DIR` | File-backed Skill registry root. |
| `SKILL_IMPORT_ROOTS` | Allowed server-path roots for Skill imports. |
| `WORKFLOW_REGISTRY_DIR` | File-backed workflow registry root. |
| `CLAUDE_COMMAND` | Claude Code CLI command, defaults to `claude`. |
| `CLAUDE_MODEL` | Claude model alias, defaults to `sonnet`. |
| `CLAUDE_MAX_BUDGET_USD` | Per-turn CLI budget, defaults to `1.00`. |
| `CLAUDE_WORKSPACE_DIR` | Working directory for Claude CLI turns. |
