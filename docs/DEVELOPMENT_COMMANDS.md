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
pnpm validate
```

`pnpm validate` runs the four validation gates in parallel.

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
```

This applies the direct Postgres knowledge-store bootstrap in `scripts/database/001_knowledge_store.sql`. It is intended for runtimes that expose Postgres but do not expose the Supabase REST/Auth API stack.

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
| `BATTLEFLOW_DATABASE_URL` | Server-only direct Postgres connection string for knowledge-store operations. |
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
