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

## Local Worktree Runtime

When running from an additional git worktree, do not rebuild local Postgres or create a new `.env` only because the worktree is missing one. Reuse the canonical local runtime configuration from the main checkout:

```bash
set -a
source /Users/lichunhe/Documents/Playground/BattleFlow/.env
set +a
BATTLEFLOW_WORKSPACE_PATH="$(pwd)" \
CLAUDE_WORKSPACE_DIR="$(pwd)" \
BATTLEFLOW_CLAUDE_TOOLS=Read,Grep,Glob,WebSearch,WebFetch,Write,Edit \
DEPLOY_RUN_PORT=5101 \
pnpm dev
```

If dependency approval blocks `pnpm dev`, keep the same environment and run the checked-in server entrypoint directly:

```bash
set -a
source /Users/lichunhe/Documents/Playground/BattleFlow/.env
set +a
PORT=5101 \
DEPLOY_RUN_PORT=5101 \
BATTLEFLOW_WORKSPACE_PATH="$(pwd)" \
CLAUDE_WORKSPACE_DIR="$(pwd)" \
BATTLEFLOW_CLAUDE_TOOLS=Read,Grep,Glob,WebSearch,WebFetch,Write,Edit \
./node_modules/.bin/tsx watch src/server.ts
```

Before starting a new service, check whether the expected port is already used by another BattleFlow worktree. Reuse it or choose another port instead of killing it. A healthy unauthenticated runtime returns `401 Authentication required` from `/api/auth/me`; `503 Authentication storage is not configured` means the runtime environment was not loaded.

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

`scripts/start.sh` runs `node dist/server.js`, so `pnpm build` must run first. Production start defaults `BATTLEFLOW_CLAUDE_TOOLS` to `Read,Grep,Glob,WebSearch,WebFetch,Write,Edit`; override the variable only when the deployment needs to disable or restrict Claude Code file-read, web, or guarded node-local write tools.

## Docker Compose

```bash
docker compose up -d --build
```

The Docker image starts through `pnpm start`, not `node dist/server.js`, so the same production defaults from `scripts/start.sh` are applied. `docker-compose.yml` also passes `BATTLEFLOW_CLAUDE_TOOLS` explicitly as `Read,Grep,Glob,WebSearch,WebFetch,Write,Edit` by default.

Docker deployments must inject Claude authentication through environment variables. Do not rely on reading `~/.claude/settings.json` inside the container. At minimum, compose deployments provide `ANTHROPIC_BASE_URL` and `ANTHROPIC_AUTH_TOKEN`; deployments that use another supported auth mechanism may provide `ANTHROPIC_API_KEY` or `CLAUDE_CODE_OAUTH_TOKEN` through the container environment instead. After deployment, verify `GET /api/agent-runtime` reports `toolsEnabled: true`, `writeToolsEnabled: true`, `writeGuardEnabled: true`, `auth.anthropicTokenConfigured: true`, and includes `Read`, `Grep`, `Glob`, `WebSearch`, `WebFetch`, `Write`, and `Edit`.

## Database Bootstrap

```bash
BATTLEFLOW_DATABASE_URL=postgresql://... pnpm db:postgres:init
```

This applies the full direct Postgres bootstrap:

1. `scripts/database/001_knowledge_store.sql` for organizations, knowledge bases, documents, and search indexes.
2. `scripts/database/002_account_org_permissions.sql` for accounts, sessions, organizations, and grants.
3. `scripts/database/002_sso_users.sql` for SSO user compatibility.
4. `scripts/database/004_notifications.sql` for notifications.
5. `scripts/database/006_chat_runs.sql` for detached workflow chat runs and replayable run events.
6. `scripts/database/007_remove_unused_planning_surfaces.sql` for retiring legacy planning tables and external knowledge-base connection fields.

Targeted bootstrap commands are also available when only one area is missing:

```bash
BATTLEFLOW_DATABASE_URL=postgresql://... pnpm db:knowledge:init
BATTLEFLOW_DATABASE_URL=postgresql://... pnpm db:accounts:init
BATTLEFLOW_DATABASE_URL=postgresql://... pnpm db:sso:init
BATTLEFLOW_DATABASE_URL=postgresql://... pnpm db:notifications:init
BATTLEFLOW_DATABASE_URL=postgresql://... pnpm db:chat-runs:init
```

Run `pnpm db:chat-runs:init` before enabling workflow chat in any Postgres-backed deployment. `/api/chat` creates `chat_runs` and `chat_run_events` rows before starting Claude Agent SDK work; missing chat run tables will break chat start, run listing, and SSE resume.

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
| `BATTLEFLOW_DATABASE_URL` | Server-only direct Postgres connection string for account, authorization, knowledge, chat-run, and resource metadata operations. |
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
| `WORKFLOW_REGISTRY_DIR` | File-backed workflow registry root. |
| `CLAUDE_COMMAND` | Optional custom Claude executable for the Agent SDK. Leave unset to use the version-matched runtime bundled with `@anthropic-ai/claude-agent-sdk`. |
| `CLAUDE_MODEL` | Claude model alias, defaults to `sonnet`. |
| `CLAUDE_WORKSPACE_DIR` | Base working directory for Claude Agent SDK turns. |
| `BATTLEFLOW_CLAUDE_TOOLS` | Optional comma-separated Claude Code tools for SDK-backed workflow chat. `Read`, `Grep`, `Glob`, `WebSearch`, `WebFetch`, `Write`, and `Edit` are accepted; `Write` and `Edit` are guarded to the active node cwd. `MultiEdit`, `Bash`, and unknown tools are ignored. Local `pnpm dev` and production `pnpm start` default to `Read,Grep,Glob,WebSearch,WebFetch,Write,Edit` unless explicitly overridden. |
| `BATTLEFLOW_CLAUDE_SETTINGS_PATH` | Optional local-development fallback path for a Claude settings JSON file whose `env` block should be merged into the SDK subprocess environment. Do not use this as the Docker/production secret source; inject Anthropic credentials as environment variables instead. |
