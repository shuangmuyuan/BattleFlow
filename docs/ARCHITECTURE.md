# Architecture

## Runtime Shape

BattleFlow is a Next.js 16 App Router application with a custom Node HTTP server:

- `src/server.ts` creates the HTTP server, prepares the Next app, and delegates every request to Next.
- `scripts/dev.sh` runs the server through `tsx watch`.
- `scripts/build.sh` runs `next build` and bundles `src/server.ts` into `dist/server.js` with `tsup`.
- `scripts/start.sh` runs the bundled production server.

The repository is an individual application repo, not a monorepo and not an orchestrator hub.

## Major Areas

| Area | Responsibility |
| --- | --- |
| `src/app` | App Router entry points, layouts, dashboard pages, login page, API route handlers, metadata, robots. |
| `src/components/ui` | shadcn/ui primitives and bounded Radix wrappers. |
| `src/components/battleflow` | Product-level UI helpers such as page headers, cards, empty states, and compact Markdown rendering. |
| `src/lib` | File-backed registries, workflow registry, agent adapters, Skill tuning, Supabase config injection, utilities. |
| `src/storage` | Supabase client creation, direct Postgres knowledge-store access, and Drizzle schema definitions. |
| `skills/official` | Seeded product-planning Skills used to initialize the Skill registry. |
| `scripts` | Development, build, production start, and static layout validation. |

## Data and State

BattleFlow currently has two storage styles:

1. Hybrid file/Postgres runtime registries:
   - `SKILL_REGISTRY_DIR` defaults to `data/skill-registry`.
   - `WORKFLOW_REGISTRY_DIR` defaults to `data/workflows`.
   - Both directories are gitignored runtime state.
   - Skill/workflow business metadata, version/state indexes, asset manifests, and resource grants are projected into direct Postgres through `src/lib/resource-metadata-repository.ts`.
   - Large package assets, uploaded workflow files, and file-backed runtime state remain outside tracked source and are returned only after Postgres permission checks.
2. Supabase-backed legacy data model and direct Postgres application data:
   - `src/storage/database/shared/schema.ts` defines organizations, members, Skills, workflows, steps, snapshots, milestones, knowledge bases, and PRD documents.
   - `src/storage/database/supabase-client.ts` creates server clients with anon or service-role keys depending on available env.
   - `src/storage/database/postgres-client.ts` creates a server-only Postgres pool from `BATTLEFLOW_DATABASE_URL` for first-party auth, organization management, permission checks, knowledge-store operations, PRD documents, milestones, and resource metadata.
   - `scripts/database/001_knowledge_store.sql` bootstraps organizations, knowledge bases, knowledge documents, and lexical/trigram search indexes.
   - `scripts/database/002_account_org_permissions.sql` bootstraps users, password credentials, sessions, organization members, departments, teams, platform admins, resource grants, audit events, and Skill/workflow metadata tables.
   - Browser auth uses first-party BattleFlow routes under `/api/auth/*`; injected Supabase browser config remains for legacy Supabase-backed surfaces until those are migrated.

Agents must preserve the distinction between source files and runtime registry data.

## API Routes

All API handlers use App Router route handlers under `src/app/api`.

- `/api/skills` manages Skill list/detail/download/import/review/rollback/archive through Postgres-backed resource authorization while preserving file-backed package assets.
- `/api/skills/tune` generates workflow Skill tuning drafts through the Claude Code CLI.
- `/api/workflows` manages file-backed workspaces and workflows with Postgres metadata and resource grant filtering.
- `/api/workflows/validation` runs workflow step validation gates and returns the updated workflow.
- `/api/workflows/snapshots` manages workflow step snapshots after workflow authorization.
- `/api/workflows/milestones` manages milestones in direct Postgres after workflow authorization.
- `/api/chat` streams product-planning chat responses with knowledge and workflow context.
- `/api/agent-runtime` reports Claude Code CLI adapter availability.
- `/api/supabase-config` exposes browser-safe Supabase config.
- `/api/prd` reads and writes PRD documents through direct Postgres after workflow authorization.
- `/api/knowledge` handles knowledge data for the dashboard. Knowledge document indexing/search uses direct Postgres when `BATTLEFLOW_DATABASE_URL` is configured.
- `/api/auth/*`, `/api/organizations/*`, and `/api/admin/super-admins` provide first-party account, organization, department, team, and platform admin management.

Route handlers that access the file system or spawn CLI processes must keep `runtime = 'nodejs'`.

Skill package imports preserve structured package asset metadata for conventional folders such as `assets/templates/`, `assets/examples/`, `assets/`, `attachments/`, `scripts/`, `templates/`, `template/`, `tools/`, `references/`, `examples/`, and `tasks/`. `SKILL.md` is the source of truth for executable method instructions; legacy registry fields such as methodology, checklist, prompt template, and outputs are derived for compatibility. Small text assets can be included in `/api/chat` as explicitly untrusted, bounded reference context. Binary and oversized assets remain metadata-only, and imported scripts are never executed by the registry or chat runtime.

Skill registry identity has two layers: `skill_id` is the logical Skill identity used for create/update detection, while `id` remains the internal registry record key for backwards compatibility. Team-targeted imports and personal publish submissions create `review_requests` rather than temporary team Skill records. Approval creates a new team Skill when no team record has the same `skill_id`, or updates the existing team Skill with the requested version bump when one already exists. Pending review requests are listed separately from usable Skills.

## Agent Runtime Boundary

The Claude Code CLI adapter lives in `src/lib/agent-adapters/claude-code-cli.ts`.

- It checks CLI availability with `claude --version`.
- It streams JSON events from `claude -p`.
- It defaults to safe mode, no session persistence, no tools, and a configurable budget.
- It uses `CLAUDE_COMMAND`, `CLAUDE_MODEL`, `CLAUDE_MAX_BUDGET_USD`, and `CLAUDE_WORKSPACE_DIR`.

Do not grant CLI tools or broaden permissions without a security review.

## Workflow Validation Loop

Workflow step completion is guarded by a validation loop:

1. The user produces and saves a candidate assistant output for the active step.
2. The dashboard calls `POST /api/workflows/validation` with `start_step_validation` or `retry_step_validation`.
3. The route stores the candidate as `step.candidateOutput`, hashes it, writes a `validation_candidate` step snapshot, creates a validation attempt, and moves the step to `self_checking`.
4. The runtime runs a Skill self-check through the Claude Code CLI adapter in safe mode with no tools and no session persistence, then persists the phase and moves the step to `agent_validating`.
5. The runtime runs an independent Agent validation against the same candidate and acceptance criteria.
6. Only when both phases pass does the route set `step.status = "completed"` and promote the candidate into `step.output`.
7. Failed or error results set `step.status = "validation_failed"`, keep the candidate in candidate fields, leave `step.output` unchanged, and keep downstream steps blocked.

The workflow step status values are:

- `pending`: locked until the active execution group reaches the step;
- `in_progress`: editable and ready for chat output;
- `self_checking`: Skill self-check is running;
- `agent_validating`: independent Agent validation is running;
- `validation_failed`: current candidate did not pass and the user must revise or retry;
- `completed`: candidate passed validation and became durable step output.

Each workflow stores `validationAttempts` with criteria, candidate hash, candidate snapshot ID, self-check result, Agent validation result, final attempt status, and timestamps. The dashboard's `门禁` tab reads these records to show criteria, findings, blockers, candidate download, and retry actions.

## UI Architecture

The dashboard has a fixed viewport shell in `src/app/dashboard/layout.tsx`:

- desktop sidebar with collapsible navigation;
- mobile horizontal navigation;
- bounded main scroll regions;
- theme toggle using `useTheme`;
- first-party account, active-organization, organization-switching, and capability-gated admin navigation.

Pages must own their scroll regions and avoid body-level layout drift. The static validation scripts enforce required class tokens for this.
